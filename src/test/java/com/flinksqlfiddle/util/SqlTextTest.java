package com.flinksqlfiddle.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class SqlTextTest {

    // --- stripComments: comments OUTSIDE string literals are removed ---

    @Test
    void removesLineComment() {
        assertEquals("SELECT 1 ", SqlText.stripComments("SELECT 1 -- trailing note"));
    }

    @Test
    void removesLineCommentButKeepsFollowingLine() {
        assertEquals("SELECT 1 \nFROM t", SqlText.stripComments("SELECT 1 -- note\nFROM t"));
    }

    @Test
    void removesBlockComment() {
        // Block comment is replaced by a space so surrounding tokens do not fuse.
        assertEquals("CREATE FUNCTION", SqlText.stripComments("CREATE/**/FUNCTION"));
    }

    @Test
    void removesInlineBlockCommentInConnectorOption() {
        // Block comment becomes a single space; the connector regex tolerates \s* around '='.
        assertEquals("'connector' ='jdbc'", SqlText.stripComments("'connector'/**/='jdbc'"));
    }

    // --- stripComments: comment-like text INSIDE literals is preserved ---

    @Test
    void preservesLineCommentTextInsideLiteral() {
        assertEquals("'a--b'", SqlText.stripComments("'a--b'"));
    }

    @Test
    void preservesBlockCommentTextInsideLiteral() {
        assertEquals("'a/*b*/'", SqlText.stripComments("'a/*b*/'"));
    }

    @Test
    void preservesFakerExpressionLiteral() {
        String sql = "WITH ('connector'='faker', 'fields.s.expression'='a--b/*c*/')";
        assertEquals(sql, SqlText.stripComments(sql));
    }

    @Test
    void handlesDoubledQuoteEscapeInsideLiteral() {
        // The '' escape keeps us inside the literal, so the comment-like text is preserved.
        String sql = "'it''s /* not */ a comment'";
        assertEquals(sql, SqlText.stripComments(sql));
    }

    @Test
    void stripsCommentOutsideButKeepsLiteral() {
        assertEquals("'a--b' ",
                SqlText.stripComments("'a--b' -- real comment"));
    }

    // --- edge cases ---

    @Test
    void handlesNull() {
        assertEquals("", SqlText.stripComments(null));
    }

    @Test
    void handlesUnterminatedBlockComment() {
        // Original trailing space, plus the space the block-comment replacement leaves.
        assertEquals("SELECT 1  ", SqlText.stripComments("SELECT 1 /* unclosed"));
    }
}
