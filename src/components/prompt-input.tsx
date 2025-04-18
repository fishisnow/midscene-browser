import {Button, Form, Input, Radio, Space} from 'antd';
import {useEffect} from 'react';

export type RunType = 'aiAction' | 'aiQuery' | 'aiAssert' | 'composite';

interface PromptInputProps {
    runButtonEnabled: boolean;
    form: any;
    serviceMode: string;
    selectedType?: RunType;
    dryMode?: boolean;
    stoppable?: boolean;
    loading?: boolean;
    onRun: () => void;
    onStop?: () => void;
    isCompositeMode?: boolean;
    hideRunButton?: boolean;
}

export function PromptInput({
                                runButtonEnabled,
                                form,
                                selectedType = 'aiAction',
                                stoppable = false,
                                loading = false,
                                onRun,
                                onStop,
                                isCompositeMode = false,
                                hideRunButton = false,
                            }: PromptInputProps) {
    // 当复合模式启用时，自动设置表单类型为 composite
    useEffect(() => {
        if (isCompositeMode) {
            form.setFieldsValue({
                type: 'composite',
            });
        }
    }, [form, isCompositeMode]);

    const handleFormFinish = (e: React.FormEvent) => {
        e.preventDefault();
        onRun();
    };

    return (
        <div className="prompt-input-container">
            <Form.Item
                name="type"
                initialValue={selectedType}
                style={{display: isCompositeMode ? 'none' : 'block'}}
            >
                <Radio.Group>
                    <Radio.Button value="aiAction">操作</Radio.Button>
                    <Radio.Button value="aiQuery">查询</Radio.Button>
                    <Radio.Button value="aiAssert">断言</Radio.Button>
                </Radio.Group>
            </Form.Item>

            <Form.Item
                name="prompt"
                rules={[{required: true, message: '请输入任务描述'}]}
                style={{width: '100%'}}
            >
                <Input.TextArea
                    placeholder={isCompositeMode ? "请描述你想要执行的自动化任务..." : "请描述你的操作、查询或断言..."}
                    rows={4}
                    autoSize={{minRows: 4, maxRows: 8}}
                />
            </Form.Item>

            <Space className="prompt-input-button-container">
                {!hideRunButton && (
                  <Button
                      type="primary"
                      disabled={!runButtonEnabled || loading}
                      onClick={handleFormFinish}
                      loading={loading && !stoppable}
                  >
                      {loading ? '执行中...' : '执行'}
                  </Button>
                )}

                {stoppable && (
                    <Button danger onClick={onStop} disabled={!loading}>
                        停止
                    </Button>
                )}
            </Space>
        </div>
    );
} 