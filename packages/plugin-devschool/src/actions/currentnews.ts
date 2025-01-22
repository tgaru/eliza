import {
    type Action,
    ActionExample,
    Content,
    generateText,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
} from "@elizaos/core";

async function getCurrentNews(searchTerm: string) {
    const response = await fetch(`https://newsapi.org/v2/everything?q=${searchTerm}&language=ru&apiKey=${process.env.NEWSAPIORG_API_KEY}`)
    const data = await response.json();

    return data.articles
        .slice(0, 5)
        .map((article) => `${article.title}\n\n${article.description}\n\n${article.url}`)
        .join("\n\n----------------\n\n");
}

export const currentNewsAction: Action = {
    name: "CURRENT_NEWS",
    similes: ["НОВОСТИ", "ТЕКУЩИЕ НОВОСТИ"],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true;
    },
    description: "Get current news action",
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: { [key: string]: unknown },
        _callback: HandlerCallback,

    ): Promise<boolean> => {
        const contextSearchTerm = `Извлеки поисковую фразу из сообщения пользователя. Сообщение пользователя:\n${_message.content.text}\n\nВерни только поисковую фразу, без остального текста.`

        const searchTerm = await generateText({
            runtime: _runtime,
            context: contextSearchTerm,
            modelClass: ModelClass.MEDIUM,
            stop: ["\n"]
        });

        const currenNews = await getCurrentNews(searchTerm)

        const responseText = `Последние новости по запросу "${searchTerm}":\n\n${currenNews}`;

        const newMemory: Memory = {
            userId: _message.userId,
            agentId: _message.agentId,
            roomId: _message.roomId,
            content: {
                text: responseText,
                action: 'CURRENT_NEWS_RESPONSE',
                source: _message.content?.source
            } as Content
        };

        await _runtime.messageManager.createMemory(newMemory);

        await _callback(newMemory.content);

        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: 'Какие последние новости?' },
            },
        ]
    ] as ActionExample[][],
} as Action;
