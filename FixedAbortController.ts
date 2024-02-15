export default class FixedAbortController extends AbortController {
    constructor() {
        super();
        this.signal.throwIfAborted = () => {
            if (this.signal.aborted) {
                throw FixedAbortController.REASON;
            }
        }
    }

    static REASON: string = 'thrownBecauseAborted';
}