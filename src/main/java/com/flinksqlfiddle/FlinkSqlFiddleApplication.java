package com.flinksqlfiddle;

import com.flinksqlfiddle.flink.FlinkProperties;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.context.event.EventListener;

@SpringBootApplication
@ConfigurationPropertiesScan
public class FlinkSqlFiddleApplication {

  private static final Logger log = LoggerFactory.getLogger(FlinkSqlFiddleApplication.class);

  private final FlinkProperties flinkProperties;

  public FlinkSqlFiddleApplication(FlinkProperties flinkProperties) {
    this.flinkProperties = flinkProperties;
  }

  public static void main(String[] args) {
    SpringApplication.run(FlinkSqlFiddleApplication.class, args);
  }

  @EventListener(ApplicationReadyEvent.class)
  public void onReady() {
    log.info("Flink SQL Fiddle started [parallelism={}, network={}, managed={}, sessionIdleTimeout={}]",
             flinkProperties.parallelism(),
             flinkProperties.networkMemory(),
             flinkProperties.managedMemory(),
             flinkProperties.sessionIdleTimeout().toMinutes() + " min");
  }
}
