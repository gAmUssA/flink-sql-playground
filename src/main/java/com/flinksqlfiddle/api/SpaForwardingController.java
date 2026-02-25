package com.flinksqlfiddle.api;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SpaForwardingController {

    @GetMapping("/f/**")
    public String forwardToIndex() {
        return "forward:/index.html";
    }
}
