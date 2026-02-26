package com.flinksqlfiddle.faker;

import net.datafaker.Faker;

import org.apache.flink.annotation.VisibleForTesting;
import org.apache.flink.api.common.functions.OpenContext;
import org.apache.flink.api.common.functions.RichFlatMapFunction;
import org.apache.flink.table.data.GenericRowData;
import org.apache.flink.table.data.RowData;
import org.apache.flink.table.types.logical.LogicalType;
import org.apache.flink.util.Collector;

import java.util.ArrayList;
import java.util.List;

class FlinkFakerGenerator extends RichFlatMapFunction<Long, RowData> {

  private Faker faker;

  private final String[][] fieldExpressions;
  private final Float[] fieldNullRates;
  private final Integer[] fieldCollectionLengths;
  private final LogicalType[] types;
  private final long rowsPerSecond;
  private long soFarThisSecond;
  private long nextReadTime;

  public FlinkFakerGenerator(
      String[][] fieldExpressions,
      Float[] fieldNullRates,
      Integer[] fieldCollectionLengths,
      LogicalType[] types,
      long rowsPerSecond) {
    this.fieldExpressions = fieldExpressions;
    this.fieldNullRates = fieldNullRates;
    this.fieldCollectionLengths = fieldCollectionLengths;
    this.types = types;
    this.rowsPerSecond = rowsPerSecond;
  }

  @Override
  public void open(final OpenContext openContext) throws Exception {
    super.open(openContext);
    faker = new Faker();

    nextReadTime = System.currentTimeMillis();
    soFarThisSecond = 0;
  }

  @Override
  public void flatMap(Long trigger, Collector<RowData> collector) throws Exception {
    collector.collect(generateNextRow());
    recordAndMaybeRest();
  }

  private void recordAndMaybeRest() throws InterruptedException {
    soFarThisSecond++;
    if (soFarThisSecond >= getRowsPerSecondForSubTask()) {
      rest();
    }
  }

  private void rest() throws InterruptedException {
    nextReadTime += 1000;
    long toWaitMs = Math.max(0, nextReadTime - System.currentTimeMillis());
    Thread.sleep(toWaitMs);
    soFarThisSecond = 0;
  }

  @VisibleForTesting
  RowData generateNextRow() {
    GenericRowData row = new GenericRowData(fieldExpressions.length);
    for (int i = 0; i < fieldExpressions.length; i++) {

      float fieldNullRate = fieldNullRates[i];
      if (faker.random().nextFloat() >= fieldNullRate) {
        List<String> values = new ArrayList<>();
        for (int j = 0; j < fieldCollectionLengths[i]; j++) {
          for (int k = 0; k < fieldExpressions[i].length; k++) {
            values.add(faker.expression(fieldExpressions[i][k]));
          }
        }

        row.setField(
            i, FakerUtils.stringValueToType(values.toArray(new String[0]), types[i]));
      } else {
        row.setField(i, null);
      }
    }
    return row;
  }

  private long getRowsPerSecondForSubTask() {
    int numSubtasks = getRuntimeContext().getTaskInfo().getNumberOfParallelSubtasks();
    int indexOfThisSubtask = getRuntimeContext().getTaskInfo().getIndexOfThisSubtask();
    long baseRowsPerSecondPerSubtask = rowsPerSecond / numSubtasks;

    return Math.max(
        1,
        rowsPerSecond % numSubtasks > indexOfThisSubtask
        ? baseRowsPerSecondPerSubtask + 1
        : baseRowsPerSecondPerSubtask);
  }
}
