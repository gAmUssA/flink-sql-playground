package com.flinksqlfiddle.faker;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.connector.source.lib.NumberSequenceSource;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.DataStreamSource;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.table.catalog.Column;
import org.apache.flink.table.catalog.ResolvedSchema;
import org.apache.flink.table.connector.ChangelogMode;
import org.apache.flink.table.connector.ProviderContext;
import org.apache.flink.table.connector.source.DataStreamScanProvider;
import org.apache.flink.table.connector.source.DynamicTableSource;
import org.apache.flink.table.connector.source.ScanTableSource;
import org.apache.flink.table.connector.source.abilities.SupportsLimitPushDown;
import org.apache.flink.table.data.RowData;
import org.apache.flink.table.types.DataType;
import org.apache.flink.table.types.logical.LogicalType;

import static com.flinksqlfiddle.faker.FlinkFakerTableSourceFactory.UNLIMITED_ROWS;

public class FlinkFakerTableSource implements ScanTableSource, SupportsLimitPushDown {

  private final String[][] fieldExpressions;
  private final Float[] fieldNullRates;
  private final Integer[] fieldCollectionLengths;
  private final ResolvedSchema schema;
  private final LogicalType[] types;
  private final long rowsPerSecond;
  private long numberOfRows;

  public FlinkFakerTableSource(
      String[][] fieldExpressions,
      Float[] fieldNullRates,
      Integer[] fieldCollectionLengths,
      ResolvedSchema schema,
      long rowsPerSecond,
      long numberOfRows) {
    this.fieldExpressions = fieldExpressions;
    this.fieldNullRates = fieldNullRates;
    this.fieldCollectionLengths = fieldCollectionLengths;
    this.schema = schema;
    types =
        schema.getColumns().stream()
            .filter(Column::isPhysical)
            .map(Column::getDataType)
            .map(DataType::getLogicalType)
            .toArray(LogicalType[]::new);
    this.rowsPerSecond = rowsPerSecond;
    this.numberOfRows = numberOfRows;
  }

  @Override
  public ChangelogMode getChangelogMode() {
    return ChangelogMode.insertOnly();
  }

  @Override
  public ScanRuntimeProvider getScanRuntimeProvider(final ScanContext scanContext) {
    boolean isBounded = numberOfRows != UNLIMITED_ROWS;

    return new DataStreamScanProvider() {
      @Override
      public DataStream<RowData> produceDataStream(
          ProviderContext providerContext, StreamExecutionEnvironment env) {

        long to = isBounded ? numberOfRows : Long.MAX_VALUE;
        DataStreamSource<Long> sequence =
            env.fromSource(
                new NumberSequenceSource(1, to),
                WatermarkStrategy.noWatermarks(),
                "Source Generator");

        return sequence.flatMap(
            new FlinkFakerGenerator(
                fieldExpressions, fieldNullRates, fieldCollectionLengths, types, rowsPerSecond));
      }

      @Override
      public boolean isBounded() {
        return isBounded;
      }
    };
  }

  @Override
  public DynamicTableSource copy() {
    return new FlinkFakerTableSource(
        fieldExpressions,
        fieldNullRates,
        fieldCollectionLengths,
        schema,
        rowsPerSecond,
        numberOfRows);
  }

  @Override
  public String asSummaryString() {
    return "FlinkFakerSource";
  }

  @Override
  public void applyLimit(long limit) {
    this.numberOfRows = limit;
  }
}
