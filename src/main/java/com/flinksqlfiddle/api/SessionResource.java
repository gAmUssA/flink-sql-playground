package com.flinksqlfiddle.api;

import com.flinksqlfiddle.api.dto.SessionResponse;
import com.flinksqlfiddle.api.dto.TablesResponse;
import com.flinksqlfiddle.execution.SqlExecutionService;
import com.flinksqlfiddle.session.FlinkSession;
import com.flinksqlfiddle.session.SessionManager;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.inject.Inject;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.jboss.resteasy.reactive.RestResponse;

@Path("/api/sessions")
@Produces(MediaType.APPLICATION_JSON)
public class SessionResource {

    private final SessionManager sessionManager;
    private final SqlExecutionService executionService;

    @Inject
    public SessionResource(SessionManager sessionManager, SqlExecutionService executionService) {
        this.sessionManager = sessionManager;
        this.executionService = executionService;
    }

    @POST
    @RunOnVirtualThread
    public RestResponse<SessionResponse> createSession() {
        String sessionId = sessionManager.createSession();
        return RestResponse.status(RestResponse.Status.CREATED, new SessionResponse(sessionId));
    }

    @GET
    @Path("/{id}/tables")
    @RunOnVirtualThread
    public TablesResponse listTables(@PathParam("id") String id) {
        FlinkSession session = sessionManager.getSession(id);
        return new TablesResponse(executionService.listTables(session));
    }

    @DELETE
    @Path("/{id}")
    @RunOnVirtualThread
    public RestResponse<Void> deleteSession(@PathParam("id") String id) {
        sessionManager.deleteSession(id);
        return RestResponse.noContent();
    }
}
