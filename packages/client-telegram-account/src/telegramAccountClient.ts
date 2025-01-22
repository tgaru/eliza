import {
    IAgentRuntime,
    elizaLogger,
    stringToUuid,
    UUID,
    Content,
    Memory,
    getEmbeddingZeroVector,
    HandlerCallback,
    composeContext,
    generateMessageResponse,
    messageCompletionFooter,
    ModelClass,
    State,
} from "@elizaos/core";
import {TelegramAccountConfig} from "./environment.ts";
import { TelegramClient, Api } from "telegram";
import { StoreSession } from "telegram/sessions";
import { NewMessage } from "telegram/events";
import { input} from "input";



const telegramAccountMessageHandlerTemplate = `
{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Knowledge
{{knowledge}}

# About {{agentName}}:
{{bio}}
{{lore}}

{{characterMessageExamples}}

{{providers}}

{{attachments}}

{{actions}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

{{recentMessages}}

# Task: Generate a reply in the voice, style and perspective of {{agentName}} while using the thread above as additional context. You are replying on Telegram.
{{formattedConversation}}
` + messageCompletionFooter;


// Generate a response using AI
async function _generateResponse(
    message: Memory,
    _state: State,
    context: string,
    runtime: IAgentRuntime
): Promise<Content> {
    const { userId, roomId } = message;

    const response = await generateMessageResponse({
        runtime: runtime,
        context,
        modelClass: ModelClass.LARGE,
    });

    if (!response) {
        console.error("❌ No response from generateMessageResponse");
        return null;
    }

    await runtime.databaseAdapter.log({
        body: { message, context, response },
        userId,
        roomId,
        type: "response",
    });

    return response;
}

export class TelegramAccountClient {
    private runtime: IAgentRuntime;
    private telegramAccountConfig: TelegramAccountConfig;

    constructor(runtime: IAgentRuntime, telegramAccountConfig: TelegramAccountConfig) {
        elizaLogger.log("📱 Constructing new TelegramAccountClient...");

        this.runtime = runtime;
        this.telegramAccountConfig = telegramAccountConfig;

        elizaLogger.log("✅ TelegramClient constructor completed");
    }

    public async start(): Promise<void> {
        elizaLogger.log("🚀 Starting Telegram account...");

        const telegramAccountClient =  new TelegramClient(
            new StoreSession('./data/telegram_account_session'),
            this.telegramAccountConfig.TELEGRAM_ACCOUNT_APP_ID,
            this.telegramAccountConfig.TELEGRAM_ACCOUNT_APP_HASH,
            {
                connectionRetries: 5,
                deviceModel: this.telegramAccountConfig.TELEGRAM_ACCOUNT_DEVICE_MODEL,
                systemVersion: this.telegramAccountConfig.TELEGRAM_ACCOUNT_SYSTEM_VERSION,
            }
        )

        await telegramAccountClient.start({
            phoneNumber: this.telegramAccountConfig.TELEGRAM_ACCOUNT_PHONE,
            password: null,
            phoneCode: async () => await input.text('Enter received code (got after entered phone number): '),
            onError: (err) => console.log(err),
        });

        telegramAccountClient.session.save();

        // await telegramAccountClient.connect();

        const result = await telegramAccountClient.invoke(
            new Api.users.GetFullUser({
                id: "me",
            })
        );

        const tgAccount = result.users[0];

        console.log(tgAccount);

        // await telegramAccountClient.invoke(
        //     new Api.messages.SendMessage({
        //         peer: this.telegramAccountConfig.TELEGRAM_ACCOUNT_POSTING_CHANNEL,
        //         message:JSON.stringify(tgAccount),
        //         // sendAs: "username",
        //     })
        // );

        telegramAccountClient.addEventHandler(async (event) => {
            try {
                const sender = (await event.message.getSender()) as Api.User

                let userName = sender.firstName;
                if (sender.lastName) userName += ' ' + sender.lastName;

                const userId = stringToUuid(`tguser${sender.id.toString()}`) as UUID;
                const chatId = stringToUuid(`tgchat${sender.id.toString()}` + "-" + this.runtime.agentId) as UUID;
                const agentId = this.runtime.agentId;
                const roomId = chatId;
                const messageId = stringToUuid(`tgmessage${event.message.id.toString()}` + "-" + this.runtime.agentId) as UUID;

                await this.runtime.ensureConnection(
                    userId,
                    roomId,
                    userName,
                    userName,
                    "telegram-account",
                );

                const fullText = event.message.message;

                if (!fullText) return;

                const content: Content = {
                    text: fullText,
                    source: "telegram-account",
                };

                const memory: Memory = {
                    id: messageId,
                    agentId,
                    userId,
                    roomId,
                    content,
                    createdAt: event.message.date * 1000,
                    embedding: getEmbeddingZeroVector(),
                };

                await this.runtime.messageManager.createMemory(memory);

                let state = await this.runtime.composeState(memory);
                state = await this.runtime.updateRecentMessageState(state);

                const shouldRespond = true;

                const callback: HandlerCallback = async (content: Content) => {
                    let memories = [];

                    const sentMessage = await telegramAccountClient.sendMessage(
                        sender.id,
                        {
                            message: content.text
                        }
                    )

                    const memory: Memory = {
                        id: stringToUuid(
                            `tgmessage${sentMessage.id.toString()}` +
                            "-" +
                            this.runtime.agentId
                        ),
                        agentId,
                        userId: agentId,
                        roomId,
                        content: {
                            ...content,
                            text: sentMessage.message,
                            inReplyTo: messageId,
                        },
                        createdAt: sentMessage.date * 1000,
                        embedding: getEmbeddingZeroVector(),
                    };

                    memory.content.action = content.action;

                    await this.runtime.messageManager.createMemory(memory);
                    memories.push(memory);

                    return memories;
                };

                if (shouldRespond) {
                    // Generate response
                    const context = composeContext({
                        state,
                        template:
                            this.runtime.character?.templates
                                ?.messageHandlerTemplate ||
                            telegramAccountMessageHandlerTemplate,
                    });

                    const responseContent = await _generateResponse(
                        memory,
                        state,
                        context,
                        this.runtime
                    );

                    if (!responseContent || !responseContent.text) return;

                    const responseMessages = await callback(responseContent);

                    state = await this.runtime.updateRecentMessageState(state);

                    await this.runtime.processActions(
                        memory,
                        responseMessages,
                        state,
                        callback
                    );
                }

                await this.runtime.evaluate(memory, state, shouldRespond, callback);

            } catch (error) {
                elizaLogger.error("❌ Error handling message:", error);
                elizaLogger.error("Error sending message:", error);
            }
        }, new NewMessage({ incoming: true }));
    }
}
