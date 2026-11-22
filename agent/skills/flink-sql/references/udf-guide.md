# UDF Development Guide

User-defined functions extend Flink SQL and Table API with custom logic.

## UDF Types

| Type | Class | Input → Output | Use Case |
|------|-------|----------------|----------|
| Scalar (UDF) | `ScalarFunction` | 1 row → 1 value | Transformations, calculations |
| Table (UDTF) | `TableFunction` | 1 row → N rows | Exploding arrays, parsing |
| Aggregate | `AggregateFunction` | N rows → 1 value | Custom aggregations (OSS only) |
| Table Aggregate | `TableAggregateFunction` | N rows → N values | Top-N, rankings (OSS only) |

**Confluent Cloud supports:** Scalar and Table functions only.

## Java UDF Templates

### Scalar Function

```java
package com.example.udf;

import org.apache.flink.table.functions.ScalarFunction;

public class ToUpperCase extends ScalarFunction {
    
    public String eval(String input) {
        if (input == null) {
            return null;
        }
        return input.toUpperCase();
    }
    
    // Overloaded eval for different types
    public String eval(String input, String locale) {
        if (input == null) return null;
        return input.toUpperCase(java.util.Locale.forLanguageTag(locale));
    }
}
```

### Table Function (UDTF)

```java
package com.example.udf;

import org.apache.flink.table.annotation.DataTypeHint;
import org.apache.flink.table.annotation.FunctionHint;
import org.apache.flink.table.functions.TableFunction;
import org.apache.flink.types.Row;

@FunctionHint(output = @DataTypeHint("ROW<word STRING, length INT>"))
public class SplitFunction extends TableFunction<Row> {
    
    public void eval(String str) {
        if (str == null) return;
        for (String s : str.split("\\s+")) {
            collect(Row.of(s, s.length()));
        }
    }
}
```

### Aggregate Function (OSS Flink only)

```java
package com.example.udf;

import org.apache.flink.table.functions.AggregateFunction;

public class WeightedAvg extends AggregateFunction<Double, WeightedAvg.Acc> {
    
    public static class Acc {
        public double sum = 0;
        public int count = 0;
    }
    
    @Override
    public Acc createAccumulator() {
        return new Acc();
    }
    
    public void accumulate(Acc acc, Double value, Integer weight) {
        if (value != null && weight != null) {
            acc.sum += value * weight;
            acc.count += weight;
        }
    }
    
    @Override
    public Double getValue(Acc acc) {
        return acc.count == 0 ? null : acc.sum / acc.count;
    }
}
```

## Python UDF Templates

### Scalar Function

```python
from pyflink.table import DataTypes
from pyflink.table.udf import udf

@udf(result_type=DataTypes.STRING())
def to_upper(s: str) -> str:
    return s.upper() if s else None

# Vectorized (pandas) for better performance
@udf(result_type=DataTypes.STRING(), func_type='pandas')
def to_upper_vectorized(s):
    return s.str.upper()
```

### Table Function

```python
from pyflink.table import DataTypes
from pyflink.table.udf import udtf

@udtf(result_types=[DataTypes.STRING(), DataTypes.INT()])
def split_words(text: str):
    if text:
        for word in text.split():
            yield word, len(word)
```

## Maven POM for Java UDFs

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    
    <groupId>com.example</groupId>
    <artifactId>flink-udf</artifactId>
    <version>1.0</version>
    <packaging>jar</packaging>
    
    <properties>
        <flink.version>1.19.0</flink.version>
        <java.version>17</java.version>
        <maven.compiler.source>${java.version}</maven.compiler.source>
        <maven.compiler.target>${java.version}</maven.compiler.target>
    </properties>
    
    <dependencies>
        <dependency>
            <groupId>org.apache.flink</groupId>
            <artifactId>flink-table-api-java</artifactId>
            <version>${flink.version}</version>
            <scope>provided</scope>
        </dependency>
    </dependencies>
    
    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-shade-plugin</artifactId>
                <version>3.5.0</version>
                <executions>
                    <execution>
                        <phase>package</phase>
                        <goals><goal>shade</goal></goals>
                        <configuration>
                            <filters>
                                <filter>
                                    <artifact>*:*</artifact>
                                    <excludes>
                                        <exclude>META-INF/*.SF</exclude>
                                        <exclude>META-INF/*.DSA</exclude>
                                        <exclude>META-INF/*.RSA</exclude>
                                    </excludes>
                                </filter>
                            </filters>
                        </configuration>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
</project>
```

## Registration Patterns

### OSS Flink

```java
// Temporary (session-scoped)
env.createTemporaryFunction("my_func", MyFunction.class);

// Permanent (catalog-scoped)
env.createFunction("my_func", MyFunction.class);

// With instance (for parameterized functions)
env.createTemporaryFunction("my_func", new MyFunction(param));
```

### SQL Registration

```sql
-- Temporary
CREATE TEMPORARY FUNCTION my_func AS 'com.example.MyFunction';

-- Permanent (persisted in catalog)
CREATE FUNCTION my_func AS 'com.example.MyFunction';
```

### Confluent Cloud Registration

```sql
-- Reference uploaded artifact
CREATE FUNCTION my_func 
AS 'com.example.MyFunction' 
USING JAR 'confluent-artifact://cfa-xxxxx';
```

## Confluent Cloud Deployment

### Step 1: Build JAR

```bash
mvn clean package
# Output: target/flink-udf-1.0.jar
```

### Step 2: Upload Artifact

**CLI:**
```bash
confluent flink artifact create my-udf \
  --cloud aws \
  --region us-east-1 \
  --artifact-file target/flink-udf-1.0.jar
```

**Console:**
1. Navigate to Flink workspace → Artifacts
2. Click "Upload artifact"
3. Select JAR file
4. Note the artifact ID (e.g., `cfa-xxxxx`)

### Step 3: Register Function

```sql
CREATE FUNCTION my_upper 
AS 'com.example.ToUpperCase' 
USING JAR 'confluent-artifact://cfa-xxxxx';
```

### Step 4: Use Function

```sql
SELECT my_upper(name) FROM customers;
```

## Table API UDF Usage

### Java

```java
// Scalar function
import static org.apache.flink.table.api.Expressions.*;

env.createTemporaryFunction("my_upper", ToUpperCase.class);

Table result = orders
    .select($("name"), call("my_upper", $("name")).as("upper_name"));

// Or directly with class
Table result = orders
    .select($("name"), call(ToUpperCase.class, $("name")).as("upper_name"));
```

### Table Function (LATERAL JOIN)

```java
env.createTemporaryFunction("split_words", SplitFunction.class);

Table result = sentences
    .joinLateral(call("split_words", $("text")))
    .select($("text"), $("word"), $("length"));

// Left join (keep rows with no output)
Table result = sentences
    .leftOuterJoinLateral(call("split_words", $("text")))
    .select($("text"), $("word"), $("length"));
```

## SQL UDF Usage

### Scalar Function

```sql
SELECT my_upper(name) as upper_name FROM customers;
```

### Table Function (LATERAL TABLE)

```sql
-- Inner join
SELECT s.text, w.word, w.length
FROM sentences s, LATERAL TABLE(split_words(s.text)) AS w(word, length);

-- Left join
SELECT s.text, w.word, w.length
FROM sentences s
LEFT JOIN LATERAL TABLE(split_words(s.text)) AS w(word, length) ON TRUE;
```

## Type Mapping

| Java Type | Flink Type | SQL Type |
|-----------|------------|----------|
| `String` | `STRING()` | `VARCHAR` |
| `Integer` | `INT()` | `INT` |
| `Long` | `BIGINT()` | `BIGINT` |
| `Double` | `DOUBLE()` | `DOUBLE` |
| `Boolean` | `BOOLEAN()` | `BOOLEAN` |
| `byte[]` | `BYTES()` | `VARBINARY` |
| `LocalDateTime` | `TIMESTAMP(3)` | `TIMESTAMP` |
| `Instant` | `TIMESTAMP_LTZ(3)` | `TIMESTAMP WITH LOCAL TIME ZONE` |
| `Row` | `ROW<...>` | Complex types |
| `Map<K,V>` | `MAP<K,V>` | `MAP` |
| `List<T>` | `ARRAY<T>` | `ARRAY` |

## Type Hints

Use annotations when type inference fails:

```java
import org.apache.flink.table.annotation.DataTypeHint;
import org.apache.flink.table.annotation.FunctionHint;

public class MyFunction extends ScalarFunction {
    
    // Return type hint
    @DataTypeHint("DECIMAL(10, 2)")
    public BigDecimal eval(Double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP);
    }
}

// For table functions
@FunctionHint(output = @DataTypeHint("ROW<name STRING, count BIGINT>"))
public class MyTableFunction extends TableFunction<Row> { ... }
```

## Confluent Cloud Limitations

| Limitation | Value |
|------------|-------|
| Max UDFs per statement | 10 |
| Max artifacts per environment | 100 |
| Max artifact size | 100 MB |
| Max row size (input/output) | 4 MB |
| Supported Java versions | 11, 17 |
| Supported Python version | 3.11 only |

**Not supported in Confluent Cloud:**
- Aggregate functions (UDAF)
- Table aggregate functions
- Temporary functions
- ALTER FUNCTION
- UDFs with MATCH_RECOGNIZE
- Vararg functions
- Custom type inference
- External network calls from UDFs

## Debugging UDFs

### Add Logging

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class MyFunction extends ScalarFunction {
    private static final Logger LOG = LoggerFactory.getLogger(MyFunction.class);
    
    public String eval(String input) {
        LOG.info("Processing input: {}", input);
        return input.toUpperCase();
    }
}
```

### Confluent Cloud Logging

Enable logging in UDF artifact upload, then view in Confluent Cloud Console under statement logs.

### Local Testing

```java
@Test
public void testMyFunction() {
    MyFunction func = new MyFunction();
    assertEquals("HELLO", func.eval("hello"));
    assertNull(func.eval(null));
}
```
