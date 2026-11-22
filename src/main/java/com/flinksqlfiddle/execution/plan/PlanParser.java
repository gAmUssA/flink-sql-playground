package com.flinksqlfiddle.execution.plan;

import com.flinksqlfiddle.execution.ExecutionMode;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses the {@code == Optimized Physical Plan ==} section of Flink's text EXPLAIN output into
 * a DAG. The text format is the one {@code TableEnvironment#explainSql} prints:
 *
 * <pre>
 * Sink(table=[*anonymous_collect$1*], fields=[user_id, EXPR$1], changelogMode=[NONE])
 * +- GroupAggregate(advice=[1], groupBy=[user_id], select=[...], changelogMode=[I,UB,UA])
 *    +- Join(joinType=[InnerJoin], ...)
 *       :- Exchange(distribution=[hash[user_id]], changelogMode=[I])
 *       :  +- [#1] TableSourceScan(table=[[default_catalog, default_database, orders]], ...)
 *       +- Reused(reference_id=[1])
 *
 * advice[1]: [ADVICE] You might want to enable local-global two-phase optimization ...
 * </pre>
 *
 * Every tree level is a 3-character token ({@code "+- "}, {@code ":- "}, {@code ":  "},
 * {@code "   "}), so a line's depth is its token count. A node's inputs are the lines one level
 * deeper below it. {@code [#N]} marks a sub-plan that a later {@code Reused(reference_id=[N])}
 * line points back to, which makes the tree a DAG. A statement set prints one root per sink.
 *
 * <p>The parser is lenient: an attribute list it cannot split is kept whole under {@code _raw}
 * rather than failing the request, since the plan text is not a stable API.
 */
public final class PlanParser {

    private static final Pattern SECTION = Pattern.compile("^== Optimized Physical Plan( With Advice)? ==$");
    private static final Pattern ADVICE = Pattern.compile("^advice\\[(\\d+)]:\\s*\\[(\\w+)]\\s*(.*)$");
    private static final Pattern REF_PREFIX = Pattern.compile("^\\[#(\\d+)]\\s+");
    private static final Pattern REUSED = Pattern.compile("^Reused\\(reference_id=\\[(\\d+)]\\)$");
    /** Window property references print with one unmatched quote: {@code slice_end('w$)}. */
    private static final Pattern WINDOW_REF = Pattern.compile("'(w\\d*\\$)");
    private static final List<String> TOKENS = List.of("+- ", ":- ", ":  ", "   ");
    private static final int MAX_ATTR_CHARS = 400;

    /** Operators whose state grows with the key space and is only freed by state TTL. */
    private static final Set<String> UNBOUNDED_STATE = Set.of(
            "GroupAggregate", "GlobalGroupAggregate", "IncrementalGroupAggregate",
            "GroupTableAggregate", "Join", "MultiJoin", "Rank", "Deduplicate",
            "ChangelogNormalize", "SortLimit", "Sort", "Limit", "OverAggregate");

    /** Operators whose state the watermark frees once a window, interval or version closes. */
    private static final Set<String> TIME_BOUNDED_STATE = Set.of(
            "GroupWindowAggregate", "GlobalWindowAggregate", "WindowAggregate", "WindowJoin",
            "WindowRank", "WindowDeduplicate", "IntervalJoin", "TemporalJoin",
            "TemporalSort", "PythonGroupWindowAggregate");

    private PlanParser() {
    }

    public static ExplainResult parse(String explainText, ExecutionMode mode) {
        List<String> section = physicalPlanSection(explainText);

        List<MutableNode> nodes = new ArrayList<>();
        List<Integer> roots = new ArrayList<>();
        Map<Integer, Integer> refTargets = new HashMap<>();
        // pendingReuse: (parent node, reference id) pairs resolved after the walk, in case a
        // Reused line ever precedes the [#N] line it points at.
        List<int[]> pendingReuse = new ArrayList<>();
        List<Integer> parentAtDepth = new ArrayList<>();
        List<PlanAdvice> advice = new ArrayList<>();
        StringBuilder plan = new StringBuilder();
        boolean inTree = true;

        for (String line : section) {
            // A statement set prints its sink trees separated by blank lines; the advice list
            // ("advice[1]: ..." or "No available advice...") ends the plan.
            if (inTree && (ADVICE.matcher(line.trim()).matches() || line.startsWith("No available advice"))) {
                inTree = false;
            }
            if (inTree) {
                if (line.isBlank()) {
                    if (!nodes.isEmpty()) {
                        plan.append('\n');
                    }
                    parentAtDepth.clear();
                    continue;
                }
                plan.append(line).append('\n');
                int pos = 0;
                int depth = 0;
                while (pos + 3 <= line.length() && TOKENS.contains(line.substring(pos, pos + 3))) {
                    pos += 3;
                    depth++;
                }
                String content = line.substring(pos).trim();
                Integer parent = depth == 0 ? null
                        : depth - 1 < parentAtDepth.size() ? parentAtDepth.get(depth - 1) : null;

                Matcher reused = REUSED.matcher(content);
                if (reused.matches()) {
                    if (parent != null) {
                        pendingReuse.add(new int[]{parent, Integer.parseInt(reused.group(1))});
                    }
                    continue;
                }
                Integer refId = null;
                Matcher ref = REF_PREFIX.matcher(content);
                if (ref.find()) {
                    refId = Integer.parseInt(ref.group(1));
                    content = content.substring(ref.end());
                }

                MutableNode node = new MutableNode(nodes.size(), content);
                nodes.add(node);
                if (refId != null) {
                    refTargets.put(refId, node.id);
                }
                if (parent == null) {
                    roots.add(node.id);
                } else {
                    nodes.get(parent).inputs.add(node.id);
                }
                while (parentAtDepth.size() > depth) {
                    parentAtDepth.removeLast();
                }
                parentAtDepth.add(node.id);
            } else {
                Matcher m = ADVICE.matcher(line.trim());
                if (m.matches()) {
                    advice.add(new PlanAdvice(Integer.parseInt(m.group(1)), m.group(2), m.group(3).trim()));
                } else if (!line.isBlank() && !advice.isEmpty() && !line.startsWith("No available advice")) {
                    PlanAdvice last = advice.removeLast();
                    advice.add(new PlanAdvice(last.id(), last.level(), last.text() + " " + line.trim()));
                }
            }
        }

        for (int[] reuse : pendingReuse) {
            Integer target = refTargets.get(reuse[1]);
            if (target != null) {
                nodes.get(reuse[0]).inputs.add(target);
            }
        }

        List<PlanNode> result = nodes.stream().map(n -> n.toPlanNode(mode)).toList();
        return new ExplainResult(mode, result, List.copyOf(roots), List.copyOf(advice), plan.toString().strip());
    }

    /** The lines of the optimized physical plan section, header excluded. */
    static List<String> physicalPlanSection(String explainText) {
        List<String> lines = Arrays.asList(explainText.split("\\R", -1));
        List<String> out = new ArrayList<>();
        boolean in = false;
        for (String line : lines) {
            if (SECTION.matcher(line.trim()).matches()) {
                in = true;
                continue;
            }
            if (in && line.startsWith("== ")) {
                break;
            }
            if (in) {
                out.add(line);
            }
        }
        if (!in) {
            throw new IllegalStateException("EXPLAIN output has no optimized physical plan section");
        }
        return out;
    }

    /**
     * Splits {@code key=[value], key=[value]} into an ordered map. Values keep their inner
     * brackets ({@code hash[user_id]}); brackets inside single-quoted literals are ignored.
     * Window property references lose their stray quote first; if quotes still do not pair,
     * brackets are matched without regard to quotes. Returns {@code null} when the text does
     * not have that shape.
     */
    public static Map<String, String> parseAttrs(String text) {
        String cleaned = WINDOW_REF.matcher(text).replaceAll("$1");
        Map<String, String> attrs = parseAttrs(cleaned, true);
        return attrs != null ? attrs : parseAttrs(cleaned, false);
    }

    private static Map<String, String> parseAttrs(String text, boolean quoteAware) {
        Map<String, String> attrs = new LinkedHashMap<>();
        int i = 0;
        int n = text.length();
        while (i < n) {
            while (i < n && (text.charAt(i) == ',' || text.charAt(i) == ' ')) {
                i++;
            }
            if (i >= n) {
                break;
            }
            int eq = text.indexOf('=', i);
            if (eq < 0 || eq + 1 >= n || text.charAt(eq + 1) != '[') {
                return null;
            }
            String key = text.substring(i, eq).trim();
            if (key.isEmpty() || !key.chars().allMatch(c -> Character.isLetterOrDigit(c) || c == '_' || c == '$')) {
                return null;
            }
            int end = matchingBracket(text, eq + 1, quoteAware);
            if (end < 0) {
                return null;
            }
            attrs.put(key, text.substring(eq + 2, end));
            i = end + 1;
        }
        return attrs;
    }

    /** Index of the ']' closing the '[' at {@code open}, or -1. */
    private static int matchingBracket(String text, int open, boolean quoteAware) {
        int depth = 0;
        boolean quoted = false;
        for (int i = open; i < text.length(); i++) {
            char c = text.charAt(i);
            if (quoteAware && c == '\'') {
                quoted = !quoted;
            } else if (!quoted && c == '[') {
                depth++;
            } else if (!quoted && c == ']') {
                depth--;
                if (depth == 0) {
                    return i;
                }
            }
        }
        return -1;
    }

    /** Splits on commas outside brackets and parentheses. */
    public static List<String> splitTopLevel(String text) {
        List<String> parts = new ArrayList<>();
        int depth = 0;
        int start = 0;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '[' || c == '(') {
                depth++;
            } else if (c == ']' || c == ')') {
                depth--;
            } else if (c == ',' && depth == 0) {
                parts.add(text.substring(start, i).trim());
                start = i + 1;
            }
        }
        parts.add(text.substring(start).trim());
        return parts;
    }

    private static final class MutableNode {
        final int id;
        final String kind;
        final Map<String, String> attrs;
        final List<Integer> inputs = new ArrayList<>();

        MutableNode(int id, String content) {
            this.id = id;
            int paren = content.indexOf('(');
            if (paren < 0 || !content.endsWith(")")) {
                this.kind = content;
                this.attrs = new LinkedHashMap<>();
            } else {
                this.kind = content.substring(0, paren).trim();
                String inner = content.substring(paren + 1, content.length() - 1);
                Map<String, String> parsed = parseAttrs(inner);
                if (parsed == null) {
                    parsed = new LinkedHashMap<>();
                    parsed.put("_raw", inner);
                }
                this.attrs = parsed;
            }
        }

        PlanNode toPlanNode(ExecutionMode mode) {
            Map<String, String> shown = new LinkedHashMap<>();
            attrs.forEach((k, v) -> {
                if (!k.equals("changelogMode") && !k.equals("advice")) {
                    shown.put(k, v.length() > MAX_ATTR_CHARS ? v.substring(0, MAX_ATTR_CHARS) + "…" : v);
                }
            });
            List<String> changelog = null;
            String rawMode = attrs.get("changelogMode");
            if (rawMode != null) {
                changelog = Arrays.stream(rawMode.split(","))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty() && !s.equals("NONE"))
                        .toList();
            }
            List<Integer> adviceIds = new ArrayList<>();
            String rawAdvice = attrs.get("advice");
            if (rawAdvice != null) {
                for (String part : rawAdvice.split(",")) {
                    try {
                        adviceIds.add(Integer.parseInt(part.trim()));
                    } catch (NumberFormatException ignored) {
                        // not a number; skip
                    }
                }
            }
            return new PlanNode(id, kind, label(), Collections.unmodifiableMap(shown), changelog,
                    state(mode), List.copyOf(adviceIds), List.copyOf(inputs));
        }

        private String label() {
            String table = attrs.get("table");
            if (kind.endsWith("TableSourceScan") && table != null) {
                return "Source: " + tableName(table);
            }
            if (kind.equals("Values")) {
                return "Source: VALUES";
            }
            if (kind.equals("Sink") && table != null) {
                return table.contains("anonymous_collect") ? "Sink: collect" : "Sink: " + sinkName(table);
            }
            return kind;
        }

        /** {@code [default_catalog, default_database, orders, project=[...]]} → {@code orders}. */
        private static String tableName(String table) {
            String inner = table.startsWith("[") && table.endsWith("]") ? table.substring(1, table.length() - 1) : table;
            List<String> parts = splitTopLevel(inner);
            String name = parts.size() >= 3 ? parts.get(2) : parts.getLast();
            return name.replace("`", "");
        }

        /** {@code default_catalog.default_database.sink} → {@code sink}. */
        private static String sinkName(String table) {
            String name = table.replace("`", "");
            int dot = name.lastIndexOf('.');
            return dot >= 0 ? name.substring(dot + 1) : name;
        }

        private String state(ExecutionMode mode) {
            // Batch operators keep no long-lived state: they sort or hash a bounded input once.
            if (mode == ExecutionMode.BATCH) {
                return null;
            }
            if (kind.equals("Sink") && "true".equals(attrs.get("upsertMaterialize"))) {
                return "unbounded"; // SinkUpsertMaterializer
            }
            if (kind.equals("Match")) {
                // Partial matches per key. Only MATCH_RECOGNIZE's WITHIN bounds them, and the
                // plan text does not print WITHIN, so the plan cannot tell which case this is.
                return "pattern";
            }
            if (TIME_BOUNDED_STATE.contains(kind)) {
                return "time-bounded";
            }
            if (UNBOUNDED_STATE.contains(kind)) {
                return "unbounded";
            }
            return null;
        }
    }
}
