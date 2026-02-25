package com.flinksqlfiddle.api;

import com.flinksqlfiddle.api.dto.FiddleResponse;
import com.flinksqlfiddle.api.dto.SaveFiddleRequest;
import com.flinksqlfiddle.execution.ExecutionMode;
import com.flinksqlfiddle.fiddle.Fiddle;
import com.flinksqlfiddle.fiddle.FiddleService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/fiddles")
public class FiddleController {

    private final FiddleService fiddleService;

    public FiddleController(FiddleService fiddleService) {
        this.fiddleService = fiddleService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public FiddleResponse saveFiddle(@Valid @RequestBody SaveFiddleRequest request) {
        Fiddle fiddle = fiddleService.save(request.schema(), request.query(), request.mode().name());
        return toResponse(fiddle);
    }

    @GetMapping("/{shortCode}")
    public FiddleResponse loadFiddle(@PathVariable String shortCode) {
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

    public static class FiddleNotFoundException extends RuntimeException {
        public FiddleNotFoundException(String shortCode) {
            super("Fiddle not found: " + shortCode);
        }
    }
}
