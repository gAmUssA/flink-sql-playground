package com.flinksqlfiddle.api;

import com.flinksqlfiddle.execution.NotExplainableException;
import com.flinksqlfiddle.execution.TableNotFoundException;
import com.flinksqlfiddle.execution.timeline.TimelineService;
import com.flinksqlfiddle.execution.timeline.TimelineService.TimelineListener;
import com.flinksqlfiddle.execution.timeline.TimelineService.TimelineMeta;
import com.flinksqlfiddle.execution.timeline.TimelineService.TimelineQuery;
import com.flinksqlfiddle.execution.timeline.WindowSpec;
import com.flinksqlfiddle.session.FlinkSession;
import com.flinksqlfiddle.session.SessionManager;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import java.time.ZoneOffset;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@QuarkusTest
class TimelineResourceTest {

    @InjectMock
    SessionManager sessionManager;

    @InjectMock
    TimelineService timelineService;

    private static final String URL = "/api/sessions/s1/timeline/stream";

    @Test
    void streamsMetaTicksAndEnd() throws Exception {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("s1")).thenReturn(session);
        TimelineMeta meta = new TimelineMeta("clicks", "ts", "`ts` - INTERVAL '2' SECOND",
                new WindowSpec("TUMBLE", 5000, 5000, 0, 0));
        TimelineQuery query = new TimelineQuery(meta, null, ZoneOffset.UTC);
        when(timelineService.prepare(eq(session), eq("SELECT 1"))).thenReturn(query);
        doAnswer(inv -> {
            TimelineListener l = inv.getArgument(1);
            l.onTick(1000, null);
            l.onTick(2000, 500L);
            l.onEnd(2, false);
            return null;
        }).when(timelineService).stream(eq(query), any());

        String body = given().contentType("application/json")
                .body("{\"sql\": \"SELECT 1\", \"mode\": \"STREAMING\"}")
                .when().post(URL)
                .then().statusCode(200)
                .extract().asString();
        String[] lines = body.strip().split("\n");
        assertEquals(4, lines.length, body);
        assertEquals("{\"type\":\"meta\",\"meta\":{\"table\":\"clicks\",\"rowtime\":\"ts\",\"watermark\":\"`ts` - INTERVAL '2' SECOND\","
                + "\"window\":{\"kind\":\"TUMBLE\",\"sizeMs\":5000,\"slideMs\":5000,\"stepMs\":0,\"offsetMs\":0}}}", lines[0]);
        assertEquals("{\"type\":\"tick\",\"t\":1000}", lines[1]);
        assertEquals("{\"type\":\"tick\",\"t\":2000,\"wm\":500}", lines[2]);
        assertEquals("{\"type\":\"end\",\"count\":2,\"truncated\":false}", lines[3]);
    }

    @Test
    void batchModeIsRejectedBeforeAnyWork() throws Exception {
        given().contentType("application/json")
                .body("{\"sql\": \"SELECT 1\", \"mode\": \"BATCH\"}")
                .when().post(URL)
                .then().statusCode(400)
                .body(containsString("\"code\":\"NOT_STREAMING\""));
        verify(timelineService, never()).prepare(any(), any());
    }

    @Test
    void queryWithoutEventTimeIsABadRequest() {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("s1")).thenReturn(session);
        when(timelineService.prepare(eq(session), any()))
                .thenThrow(new NotExplainableException("No event time", "NO_EVENT_TIME"));
        given().contentType("application/json")
                .body("{\"sql\": \"SELECT a FROM plain\", \"mode\": \"STREAMING\"}")
                .when().post(URL)
                .then().statusCode(400)
                .body(containsString("\"code\":\"NO_EVENT_TIME\""));
    }

    @Test
    void unknownTableIsABadRequestNamingTheTable() {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("s1")).thenReturn(session);
        when(timelineService.prepare(eq(session), any()))
                .thenThrow(new TableNotFoundException("clicks", null, "Object 'clicks' not found", null));
        given().contentType("application/json")
                .body("{\"sql\": \"SELECT * FROM clicks\", \"mode\": \"STREAMING\"}")
                .when().post(URL)
                .then().statusCode(400)
                .body(containsString("\"code\":\"TABLE_NOT_FOUND\""))
                .body(containsString("\"table\":\"clicks\""));
    }

    @Test
    void probeFailureMidStreamIsAnErrorFrame() throws Exception {
        FlinkSession session = mock(FlinkSession.class);
        when(sessionManager.getSession("s1")).thenReturn(session);
        TimelineQuery query = new TimelineQuery(new TimelineMeta("t", "ts", "ts", null), null, ZoneOffset.UTC);
        when(timelineService.prepare(eq(session), any())).thenReturn(query);
        doAnswer(inv -> {
            throw new IllegalStateException("job failed");
        }).when(timelineService).stream(eq(query), any());
        String body = given().contentType("application/json")
                .body("{\"sql\": \"SELECT 1\", \"mode\": \"STREAMING\"}")
                .when().post(URL)
                .then().statusCode(200).extract().asString();
        String[] lines = body.strip().split("\n");
        assertEquals("{\"type\":\"error\",\"error\":\"job failed\"}", lines[lines.length - 1]);
    }
}
