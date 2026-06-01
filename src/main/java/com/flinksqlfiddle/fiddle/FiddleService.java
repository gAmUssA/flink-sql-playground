package com.flinksqlfiddle.fiddle;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Optional;

@ApplicationScoped
public class FiddleService {

    private static final Logger log = LoggerFactory.getLogger(FiddleService.class);

    private final FiddleRepository repository;

    @Inject
    public FiddleService(FiddleRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public Fiddle save(String schema, String query, String mode) {
        String shortCode = generateShortCode(schema + "|" + query + "|" + mode);
        Fiddle fiddle = repository.findByIdOptional(shortCode)
                .orElseGet(() -> {
                    Fiddle created = new Fiddle(shortCode, schema, query, mode);
                    repository.persist(created);
                    return created;
                });
        log.info("Fiddle saved: {}", shortCode);
        return fiddle;
    }

    public Optional<Fiddle> load(String shortCode) {
        log.debug("Loading fiddle: {}", shortCode);
        return repository.findByIdOptional(shortCode);
    }

    private String generateShortCode(String content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(content.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash).substring(0, 8);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }
}
