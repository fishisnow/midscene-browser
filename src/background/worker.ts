/// <reference types="chrome" />

import type { WebUIContext } from '@midscene/web/utils';


export const workerMessageTypes = {
  SAVE_CONTEXT: 'save-context',
  GET_CONTEXT: 'get-context',
};

// save screenshot
export interface WorkerRequestSaveContext {
  context: WebUIContext;
}

export interface WorkerRequestGetContext {
  id: string;
}

// console-browserify won't work in worker, so we need to use globalThis.console
const console = globalThis.console;

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// cache data between sidepanel and fullscreen playground
const randomUUID = () => {
  return Math.random().toString(36).substring(2, 15);
};
const cacheMap = new Map<string, WebUIContext>();
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  console.log('Message received in service worker:', request);

  switch (request.type) {
    case workerMessageTypes.SAVE_CONTEXT: {
      const payload: WorkerRequestSaveContext = request.payload;
      const { context } = payload;
      const id = randomUUID();
      cacheMap.set(id, context);
      sendResponse({ id });
      break;
    }
    case workerMessageTypes.GET_CONTEXT: {
      const payload: WorkerRequestGetContext = request.payload;
      const { id } = payload;
      const context = cacheMap.get(id) as WebUIContext;
      if (!context) {
        sendResponse({ error: 'Screenshot not found' });
      } else {
        sendResponse({ context });
      }

      break;
    }
    default:
      console.log('sending response');
      sendResponse({ error: 'Unknown message type' });
      break;
  }
});
