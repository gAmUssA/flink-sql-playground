package com.flinksqlfiddle.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import java.io.InputStream;

/**
 * Serves the single-page app shell for shareable fiddle deep links ({@code /f/**}).
 * Replaces the Spring MVC {@code forward:/index.html} controller — Quarkus serves
 * {@code index.html} from {@code META-INF/resources} at the root, and this resource
 * returns the same shell for client-side routes so a refresh on {@code /f/<code>}
 * still loads the app.
 */
@Path("/f")
@Produces(MediaType.TEXT_HTML)
public class SpaResource {

    @GET
    public InputStream root() {
        return index();
    }

    @GET
    @Path("/{path:.*}")
    public InputStream forward() {
        return index();
    }

    private InputStream index() {
        InputStream in = SpaResource.class.getResourceAsStream("/META-INF/resources/index.html");
        if (in == null) {
            throw new NotFoundException("index.html not found");
        }
        return in;
    }
}
