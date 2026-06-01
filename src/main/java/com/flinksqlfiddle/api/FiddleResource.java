package com.flinksqlfiddle.api;

import com.flinksqlfiddle.api.dto.FiddleResponse;
import com.flinksqlfiddle.api.dto.SaveFiddleRequest;
import com.flinksqlfiddle.execution.ExecutionMode;
import com.flinksqlfiddle.fiddle.Fiddle;
import com.flinksqlfiddle.fiddle.FiddleNotFoundException;
import com.flinksqlfiddle.fiddle.FiddleService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.jboss.resteasy.reactive.RestResponse;

@Path("/api/fiddles")
@Produces(MediaType.APPLICATION_JSON)
public class FiddleResource {

    private final FiddleService fiddleService;

    @Inject
    public FiddleResource(FiddleService fiddleService) {
        this.fiddleService = fiddleService;
    }

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @RunOnVirtualThread
    public RestResponse<FiddleResponse> saveFiddle(@Valid SaveFiddleRequest request) {
        Fiddle fiddle = fiddleService.save(request.schema(), request.query(), request.mode().name());
        return RestResponse.status(RestResponse.Status.CREATED, toResponse(fiddle));
    }

    @GET
    @Path("/{shortCode}")
    @RunOnVirtualThread
    public FiddleResponse loadFiddle(@PathParam("shortCode") String shortCode) {
        Fiddle fiddle = fiddleService.load(shortCode)
                .orElseThrow(() -> new FiddleNotFoundException(shortCode));
        return toResponse(fiddle);
    }

    private FiddleResponse toResponse(Fiddle fiddle) {
        return new FiddleResponse(
                fiddle.getShortCode(),
                fiddle.getSchema(),
                fiddle.getQuery(),
                ExecutionMode.valueOf(fiddle.getMode())
        );
    }
}
