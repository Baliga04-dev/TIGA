---
title: The customer waits for WhatsApp
topic: Queues, async work and dead letters
---
## Why you're doing this
After charging, orders sends the WhatsApp confirmation and waits for it: 1.5 seconds every time. The customer's "order placed" is 1.5 seconds slower for something they do not need to wait for. And if WhatsApp is down, orders fail even though the money is taken. Work that does not have to happen before you answer should not happen before you answer.

## The benefit, and the cost
Put the message on a queue (a Redis stream here; Kafka, RabbitMQ or SQS in bigger systems) and answer at once; a worker sends it in the background. Orders gets fast and no longer depends on WhatsApp being up. The costs: the message is sent later (eventual consistency), you must watch the backlog, you must handle messages that fail forever, and a message may be delivered twice, so the worker should be idempotent.

## Break it
**Break it** makes orders wait for WhatsApp and raises traffic to 3 orders a second.

## Watch it
Orders' p95 sits above 1.5 seconds. Press **Fix**: orders' p95 drops, but now watch "WhatsApp messages waiting" in the "Inside the shop" card. The notifier sends one message per 1.5 s and 3 arrive each second, so the backlog grows and the "confirmations are waiting" incident opens.

## Fix it: the quick switch
**Fix** turns on `async_notify`. Then press **Scale the notifier to 3**: three workers in one consumer group share the stream and the backlog drains. Finally press **Poison some messages**: 20% now fail every time; after three tries each goes to the dead-letter queue instead of blocking the line. **Check** wants orders' p95 at 1 s or less and the backlog under 20.

## Fix it: in the code
Read `worker` in `lab/services/shoplab/notifier.py`: `XREADGROUP` gives each message to one worker, `XACK` marks it done, `XAUTOCLAIM` takes over messages a crashed worker never finished, and the tries counter sends repeat failures to `notifications:dead`. Kill one notifier container mid-backlog from the service map and watch another worker claim its messages.

## What interviewers ask
**Q: Why use a message queue?**
To decouple producers from consumers in time and availability, smooth bursts, and let each side scale on its own. The producer answers quickly; the work still happens.

**Q: What is a dead-letter queue?**
Where messages go after failing a set number of times, so one bad message cannot block or endlessly retry. Someone inspects them, fixes the cause and replays them.

**Q: What does "at least once" delivery mean for your consumer?**
The same message may arrive twice (a worker crashed after doing the work but before acknowledging). Make the handler idempotent: record what you have processed, or make the effect naturally repeatable.
