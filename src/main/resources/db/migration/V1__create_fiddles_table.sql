CREATE TABLE fiddles (
    short_code VARCHAR(8)  NOT NULL PRIMARY KEY,
    schema_ddl TEXT         NOT NULL,
    query      TEXT         NOT NULL,
    mode       VARCHAR(20)  NOT NULL,
    created_at TIMESTAMP    NOT NULL
);
