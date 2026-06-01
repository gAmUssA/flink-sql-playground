package com.flinksqlfiddle.fiddle;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class FiddleServiceTest {

    private FiddleRepository repository;
    private FiddleService service;

    @BeforeEach
    void setUp() {
        repository = mock(FiddleRepository.class);
        service = new FiddleService(repository);
    }

    @Test
    void saveCreatesNewFiddle() {
        when(repository.findByIdOptional(anyString())).thenReturn(Optional.empty());

        Fiddle result = service.save("CREATE TABLE t(id INT)", "SELECT * FROM t", "BATCH");

        assertNotNull(result);
        assertEquals("CREATE TABLE t(id INT)", result.getSchema());
        assertEquals("SELECT * FROM t", result.getQuery());
        assertEquals("BATCH", result.getMode());
        verify(repository).persist(any(Fiddle.class));
    }

    @Test
    void saveReturnExistingForDuplicate() {
        Fiddle existing = new Fiddle("existing1", "CREATE TABLE t(id INT)", "SELECT * FROM t", "BATCH");
        when(repository.findByIdOptional(anyString())).thenReturn(Optional.of(existing));

        Fiddle result = service.save("CREATE TABLE t(id INT)", "SELECT * FROM t", "BATCH");

        assertSame(existing, result);
        verify(repository, never()).persist(any(Fiddle.class));
    }

    @Test
    void saveGeneratesDeterministicShortCode() {
        when(repository.findByIdOptional(anyString())).thenReturn(Optional.empty());

        Fiddle first = service.save("schema1", "query1", "BATCH");
        Fiddle second = service.save("schema1", "query1", "BATCH");

        assertEquals(first.getShortCode(), second.getShortCode());
    }

    @Test
    void saveGeneratesDifferentCodesForDifferentInput() {
        when(repository.findByIdOptional(anyString())).thenReturn(Optional.empty());

        Fiddle first = service.save("schema1", "query1", "BATCH");
        Fiddle second = service.save("schema2", "query2", "BATCH");

        assertNotEquals(first.getShortCode(), second.getShortCode());
    }

    @Test
    void shortCodeIsEightHexCharacters() {
        when(repository.findByIdOptional(anyString())).thenReturn(Optional.empty());

        Fiddle result = service.save("any schema", "any query", "BATCH");

        assertTrue(result.getShortCode().matches("[0-9a-f]{8}"),
                "Short code should be 8 hex characters but was: " + result.getShortCode());
    }

    @Test
    void loadReturnsEntityWhenExists() {
        Fiddle fiddle = new Fiddle("abc12345", "schema", "query", "BATCH");
        when(repository.findByIdOptional("abc12345")).thenReturn(Optional.of(fiddle));

        Optional<Fiddle> result = service.load("abc12345");

        assertTrue(result.isPresent());
        assertSame(fiddle, result.get());
    }

    @Test
    void loadReturnsEmptyWhenNotExists() {
        when(repository.findByIdOptional("nonexistent")).thenReturn(Optional.empty());

        Optional<Fiddle> result = service.load("nonexistent");

        assertTrue(result.isEmpty());
    }

    @Test
    void saveDifferentModeProducesDifferentCode() {
        when(repository.findByIdOptional(anyString())).thenReturn(Optional.empty());

        Fiddle batch = service.save("same schema", "same query", "BATCH");
        Fiddle streaming = service.save("same schema", "same query", "STREAMING");

        assertNotEquals(batch.getShortCode(), streaming.getShortCode());
    }
}
