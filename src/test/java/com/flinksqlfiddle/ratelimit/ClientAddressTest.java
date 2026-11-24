package com.flinksqlfiddle.ratelimit;

import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.net.SocketAddress;
import io.vertx.ext.web.RoutingContext;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ClientAddressTest {

    private static RoutingContext contextWith(SocketAddress remote) {
        RoutingContext rc = Mockito.mock(RoutingContext.class);
        HttpServerRequest req = Mockito.mock(HttpServerRequest.class);
        Mockito.when(rc.request()).thenReturn(req);
        Mockito.when(req.remoteAddress()).thenReturn(remote);
        return rc;
    }

    @Test
    void usesTheRemoteHostAddress() {
        assertEquals("203.0.113.7", ClientAddress.of(contextWith(SocketAddress.inetSocketAddress(1234, "203.0.113.7"))));
    }

    @Test
    void ipv6IsKept() {
        assertEquals("2001:db8::1", ClientAddress.of(contextWith(SocketAddress.inetSocketAddress(1234, "2001:db8::1"))));
    }

    @Test
    void noRemoteAddressIsOneSharedUnknownKey() {
        assertEquals("unknown", ClientAddress.of(contextWith(null)));
    }
}
