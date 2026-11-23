package com.flinksqlfiddle.api;

import io.quarkus.vertx.http.runtime.filters.Filters;
import io.vertx.ext.web.RoutingContext;
import jakarta.enterprise.event.Observes;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Lets other sites frame the embed page, and nothing else (ADR 0008).
 *
 * <p>{@code application.properties} sends {@code X-Frame-Options: DENY} and
 * {@code frame-ancestors 'none'} on every response. For exactly {@value #EMBED_PATH} this filter
 * drops the first and swaps the second for {@code frame-ancestors <app.embed.frame-ancestors>}.
 * It runs as the headers are written, so it wins whatever order the configured headers were added in.
 * Every other path, the API included, keeps the strict values.
 */
@ApplicationScoped
public class EmbedFraming {

    static final String EMBED_PATH = "/embed.html";
    private static final String CSP = "Content-Security-Policy";
    private static final String STRICT = "frame-ancestors 'none'";

    private final String frameAncestors;

    EmbedFraming(@ConfigProperty(name = "app.embed.frame-ancestors", defaultValue = "*") String frameAncestors) {
        this.frameAncestors = frameAncestors;
    }

    void register(@Observes Filters filters) {
        filters.register(this::allowFraming, 100);
    }

    private void allowFraming(RoutingContext rc) {
        if (EMBED_PATH.equals(rc.normalizedPath())) {
            rc.addHeadersEndHandler(v -> {
                var headers = rc.response().headers();
                headers.remove("X-Frame-Options");
                String csp = headers.get(CSP);
                if (csp != null && csp.contains(STRICT)) {
                    headers.set(CSP, csp.replace(STRICT, "frame-ancestors " + frameAncestors));
                }
            });
        }
        rc.next();
    }
}
