import { createApp } from './app.js';
import { llmInfo } from './agent/llm.js';

const port = Number(process.env.PORT) || 8787;
createApp().listen(port, () => {
  const { provider, model } = llmInfo();
  console.log(`kosh api on http://localhost:${port}  (advisor: ${provider}${model ? ` / ${model}` : ''})`);
});
