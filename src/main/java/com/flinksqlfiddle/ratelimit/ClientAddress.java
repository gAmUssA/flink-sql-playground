package com.flinksqlfiddle.ratelimit;

import io.vertx.core.net.SocketAddress;
import io.vertx.ext.web.RoutingContext;

/**
 * The client a request counts against. With {@code quarkus.http.proxy.*} set,
 * {@code request.remoteAddress()} is the forwarded client ({@code X-Forwarded-For}), and the TCP
 * peer when the header is absent. The key is the client address, never the {@code Origin}
 * (embed requests come from third-party pages, ADR 0008).
 */
final class ClientAddress {

    static final String UNKNOWN = "unknown";

    private ClientAddress() {
    }

    static String of(RoutingContext rc) {
        SocketAddress remote = rc.request().remoteAddress();
        if (remote == null || remote.host() == null) {
            return UNKNOWN;
        }
        return remote.host();
    }
}
