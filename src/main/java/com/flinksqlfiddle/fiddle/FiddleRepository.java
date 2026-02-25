package com.flinksqlfiddle.fiddle;

import org.springframework.data.jpa.repository.JpaRepository;

public interface FiddleRepository extends JpaRepository<Fiddle, String> {
}
