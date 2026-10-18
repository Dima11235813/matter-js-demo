import { createDealerHandler, DealerReply, DealerRequest } from "../game/connectDealer";

/**
 * Makes Connect-All puzzles off the main thread (Epic 2 · Task 2.10.6): the solver can take a second on a
 * slow phone, and the board's physics must keep running meanwhile. Logic in game/connectDealer.ts.
 * (Typed by hand: the project compiles with the DOM lib, which clashes with the WebWorker lib.)
 */
const scope = self as unknown as {
    onmessage: ((event: MessageEvent<DealerRequest>) => void) | null;
    postMessage(reply: DealerReply): void;
};
const handle = createDealerHandler();

scope.onmessage = event => {
    const reply = handle(event.data);
    if (reply) scope.postMessage(reply);
};
