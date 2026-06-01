package com.flinksqlfiddle.fiddle;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

/**
 * Panache repository for {@link Fiddle}, keyed by its String short-code id.
 * Replaces the Spring Data {@code JpaRepository}; {@code findByIdOptional} and
 * {@code persist} cover the two operations the service needs.
 */
@ApplicationScoped
public class FiddleRepository implements PanacheRepositoryBase<Fiddle, String> {
}
