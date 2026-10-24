from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_INPUT_CHARS = 2000
MAX_CONTEXT_CHARS = 30000


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=16000)

    @model_validator(mode="after")
    def validate_user_length(self) -> Self:
        if self.role == "user" and len(self.content) > MAX_INPUT_CHARS:
            raise ValueError("User question is too long")
        return self


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: list[Message] = Field(min_length=1, max_length=13)

    @model_validator(mode="after")
    def validate_conversation(self) -> Self:
        if len(self.messages) % 2 != 1:
            raise ValueError("Conversation must end with a user question")
        for index, message in enumerate(self.messages):
            if message.role != ("user" if index % 2 == 0 else "assistant"):
                raise ValueError("Messages must alternate user and assistant")
        if sum(len(message.content) for message in self.messages) > MAX_CONTEXT_CHARS:
            raise ValueError("Conversation context is too long")
        return self
