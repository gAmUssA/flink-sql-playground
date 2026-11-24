package com.flinksqlfiddle.ratelimit;

import io.vertx.ext.web.RoutingContext;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;

/**
 * Test-only routes. They live in {@code src/test}, so the production artifact does not contain them.
 */
@Path("/test-rate-limit")
public class RateLimitTestResource {

    @Inject
    RoutingContext routingContext;

    /** Limited by the {@code TEST} tier. */
    @GET
    @Path("/limited")
    @RateLimited(RateLimited.Tier.TEST)
    public String limited() {
        return "ok";
    }

    /** Not annotated: must never be limited. */
    @GET
    @Path("/open")
    public String open() {
        return "ok";
    }

    /** What the app sees as the client: proves {@code quarkus.http.proxy.*} is read. */
    @GET
    @Path("/remote-address")
    public String remoteAddress() {
        return routingContext.request().remoteAddress().host();
    }
}
