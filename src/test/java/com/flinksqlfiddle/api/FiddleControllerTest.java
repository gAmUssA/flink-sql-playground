package com.flinksqlfiddle.api;

import com.flinksqlfiddle.flink.FlinkProperties;
import com.flinksqlfiddle.fiddle.Fiddle;
import com.flinksqlfiddle.fiddle.FiddleService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(FiddleController.class)
class FiddleControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private FlinkProperties flinkProperties;

    @MockitoBean
    private FiddleService fiddleService;

    @Test
    void saveFiddleReturns201() throws Exception {
        Fiddle fiddle = new Fiddle("abcd1234", "CREATE TABLE t(id INT)", "SELECT * FROM t", "BATCH");
        when(fiddleService.save("CREATE TABLE t(id INT)", "SELECT * FROM t", "BATCH"))
                .thenReturn(fiddle);

        mockMvc.perform(post("/api/fiddles")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"schema": "CREATE TABLE t(id INT)", "query": "SELECT * FROM t", "mode": "BATCH"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.shortCode").value("abcd1234"))
                .andExpect(jsonPath("$.schema").value("CREATE TABLE t(id INT)"))
                .andExpect(jsonPath("$.query").value("SELECT * FROM t"))
                .andExpect(jsonPath("$.mode").value("BATCH"));
    }

    @Test
    void saveFiddleWithBlankSchemaReturns400() throws Exception {
        mockMvc.perform(post("/api/fiddles")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"schema": "  ", "query": "SELECT 1", "mode": "BATCH"}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void saveFiddleWithBlankQueryReturns400() throws Exception {
        mockMvc.perform(post("/api/fiddles")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"schema": "CREATE TABLE t(id INT)", "query": " ", "mode": "BATCH"}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void saveFiddleWithNullModeReturns400() throws Exception {
        mockMvc.perform(post("/api/fiddles")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"schema": "CREATE TABLE t(id INT)", "query": "SELECT 1"}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void loadFiddleReturnsResponse() throws Exception {
        Fiddle fiddle = new Fiddle("abcd1234", "CREATE TABLE t(id INT)", "SELECT * FROM t", "STREAMING");
        when(fiddleService.load("abcd1234")).thenReturn(Optional.of(fiddle));

        mockMvc.perform(get("/api/fiddles/abcd1234"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.shortCode").value("abcd1234"))
                .andExpect(jsonPath("$.mode").value("STREAMING"));
    }

    @Test
    void loadFiddleNotFoundReturns404() throws Exception {
        when(fiddleService.load(anyString())).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/fiddles/nonexistent"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("FIDDLE_NOT_FOUND"));
    }
}
