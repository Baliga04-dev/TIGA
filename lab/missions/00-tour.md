---
title: Follow one order through the shop
topic: Networking and the request path
---
## Why you're doing this
Every bug report starts the same way: "it didn't work". Before you can fix anything you have to know where a request goes, in what order, and where it can stop. In ShopLab one click on "Order" crosses six programs: your browser talks to the **gateway** on 127.0.0.1:8080; the gateway calls **orders**; orders asks **menu** for the price and stock, asks **payments** to charge, and hands a message to **notifier** for WhatsApp. Postgres and Redis sit underneath.

## The benefit, and the cost
Splitting a shop into services lets each part be changed, deployed and scaled on its own, and lets one team own one thing. The cost is that a function call became a network call: it can be slow, fail halfway, or reach a service that is down. Every later mission is about one of those costs.

## Break it
Nothing to break yet. Press **Break it** to place one order, then find it.

## Watch it
Every request gets an id (the `x-request-id` header) at the gateway, and every service writes it into its log line. Open the Logs panel, copy the request id of your order from the gateway's line, and filter by it: you will see the same id in gateway, orders, menu, payments and notifier, in order. That is a distributed trace, done by hand.

Things to notice:
- Services find each other by name (`http://menu:8000`). Docker runs a small DNS server on the lab's network; `menu` resolves to that container's address. Nothing outside the network can reach it: only the gateway publishes a port, and only on 127.0.0.1.
- Each hop is HTTP over TCP. A new TCP connection costs a round trip before any data moves; the services keep connections open (connection pooling) to avoid paying it on every call.

## Fix it: the quick switch
There is nothing to fix. Press **Check**: it places an order and confirms it went all the way through.

## Fix it: in the code
Read `lab/services/shoplab/orders.py`, function `place`. Write down, in order, every network call it makes and what happens to the customer if each one fails. Keep the list: missions 3 to 5 are about exactly those failures.

## What interviewers ask
**Q: What happens when you type a URL and press Enter?**
DNS turns the name into an address (browser cache, OS, resolver, then the authoritative servers), TCP opens a connection (three-way handshake), TLS agrees keys and checks the certificate, the browser sends an HTTP request, the server (often a load balancer, then an app) answers, and the browser parses HTML and fetches CSS, JS and images, often over the same connection.

**Q: Why do microservices need request ids?**
Because one user action becomes many log lines in many services. Without a shared id you cannot tell which lines belong together. Real systems use OpenTelemetry: the id is a trace id, each hop is a span, and a tracing tool draws the tree.

**Q: When would you not split an app into microservices?**
When one small team owns it and it fits on one machine. A modular monolith gives most of the separation without the network failures, distributed transactions and operations work.
