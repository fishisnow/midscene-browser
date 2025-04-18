/// <reference types="chrome" />
import '@midscene/visualizer/index.css';
import {ConfigProvider} from 'antd';
import {BrowserExtensionPlayground} from '../playground.tsx';
import {
    ChromeExtensionProxyPage,
    ChromeExtensionProxyPageAgent,
} from '@midscene/web/chrome-extension';

// remember to destroy the agent when the tab is destroyed: agent.page.destroy()
const extensionAgentForTab = (forceSameTabNavigation = true) => {
    const page = new ChromeExtensionProxyPage(forceSameTabNavigation);
    return new ChromeExtensionProxyPageAgent(page, {'generateReport': false});
};

export function PlaygroundPopup() {
    return (
        <ConfigProvider>
            <div className="popup-wrapper">
                <div className="tabs-container">
                    <div className="popup-playground-container">
                        <BrowserExtensionPlayground
                            getAgent={(forceSameTabNavigation?: boolean) => {
                                return extensionAgentForTab(forceSameTabNavigation);
                            }}
                            showContextPreview={false}
                        />
                    </div>
                </div>
            </div>
        </ConfigProvider>
    );
}