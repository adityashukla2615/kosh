import { createApp } from './app.js';
import { llmInfo } from './agent/llm.js';
import { warmBook } from './services/book.js';

const port = Number(process.env.PORT) || 8787;
createApp().listen(port, () => {
  const { provider, model } = llmInfo();
  warmBook(); // screen the book now so the first visitor does not wait for it
  console.log(`kosh api on http://localhost:${port}  (advisor: ${provider}${model ? ` / ${model}` : ''})`);
});
