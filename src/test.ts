import { NodeBootstraper, IService } from "./index";
import { Typing } from "@saggitarius/typing";


@Typing.register("@saggitarius/core/dist/test::Value")
export class Value {
    private static counter = 0;
    private value = ++Value.counter;
    
    public get() {
        return `Hello #${this.value}`;
    }
}

@Typing.register("@saggitarius/core/dist/test::Pair")
export class Pair {
    public constructor(
        private a: Value,
        private b: Value,
    ) {}

    public get() {
        return `${this.a.get()} and ${this.b.get()}`;
    }
}


@Typing.register("@saggitarius/core/dist/test::Service")
export class Service {
    public constructor(
        private value: Value,
        private pair: Pair,
    ) {}

    public run() {
        console.log(this.value ? this.value.get() : ":c");
        console.log(this.pair ? this.pair.get() : ":c");
    }
}

const boot = new NodeBootstraper();
boot.install((bind) => {
    bind(Value).shared(false);
    bind(Service).tag(IService);
});

debugger;
boot.start();
