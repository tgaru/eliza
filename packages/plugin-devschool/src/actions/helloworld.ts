import {
    ActionExample,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    type Action,
} from "@elizaos/core";

export const helloWorldAction: Action = {
    name: "HELLO_WORLD",
    similes: ["ПРИВЕТ"],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true;
    },
    description: "Hello World example action",
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: { [key: string]: unknown },
        _callback: HandlerCallback,

    ): Promise<boolean> => {
        const resultText = '---===Привет мир!===---'

        await _callback({
            text: resultText
        });

        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: 'Скажи: "Привет мир"' },
            },
        ]
    ] as ActionExample[][],
} as Action;
