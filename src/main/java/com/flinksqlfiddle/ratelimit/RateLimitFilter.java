package com.flinksqlfiddle.ratelimit;

import io.vertx.ext.web.RoutingContext;
import jakarta.inject.Inject;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.ResourceInfo;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.ext.Provider;

import java.lang.reflect.Method;

/**
 * Applies the rate limit to endpoints annotated {@link RateLimited} (JAX-RS name binding), so it
 * never runs on static files, the health check or any unannotated route. The method's annotation
 * wins over the class's.
 */
@Provider
@RateLimited
public class RateLimitFilter implements ContainerRequestFilter {

    @Inject
    RateLimiter limiter;

    @Inject
    RoutingContext routingContext;

    @Context
    ResourceInfo resourceInfo;

    @Override
    public void filter(ContainerRequestContext requestContext) {
        Method method = resourceInfo.getResourceMethod();
        RateLimited annotation = method.getAnnotation(RateLimited.class);
        if (annotation == null) {
            annotation = resourceInfo.getResourceClass().getAnnotation(RateLimited.class);
        }
        RateLimited.Tier tier = annotation == null ? RateLimited.Tier.STANDARD : annotation.value();
        limiter.acquire(tier, ClientAddress.of(routingContext));
    }
}
