import React, {useState, useRef} from 'react';
import {Button, Form, Input, Radio, Space} from 'antd';
import {useEffect} from 'react';
import {SendOutlined, LoadingOutlined, StopOutlined} from '@ant-design/icons';
import { ExecuteButton } from '../components/common';

interface PromptInputProps {
    runButtonEnabled: boolean;
    hideRunButton?: boolean;
    form: any;
    loading: boolean;
    stoppable: boolean;
    isCompositeMode?: boolean;
    selectedType?: string;
    onRun: () => Promise<void>;
    onStop: () => Promise<void>;
}

export function PromptInput({
                                runButtonEnabled,
                                hideRunButton = false,
                                form,
                                loading,
                                stoppable,
                                isCompositeMode = false,
                                selectedType,
                                onRun,
                                onStop,
                            }: PromptInputProps) {
    const textAreaRef = useRef<any>(null);

    // 设置文本框高度自适应
    const [textAreaHeight, setTextAreaHeight] = useState('100px');

    // 处理文本输入变化，调整文本框高度
    const handleTextAreaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const textArea = e.target;
        const scrollHeight = textArea.scrollHeight;
        // 设置最大高度为150px，超过则允许滚动
        const maxHeight = 150;
        // 最小高度为100px
        const minHeight = 100;

        const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
        setTextAreaHeight(`${newHeight}px`);
    };

    // 处理提交
    const handleSubmit = () => {
        if (!runButtonEnabled || loading) return;
        onRun();
    };

    // 处理停止
    const handleStop = () => {
        if (stoppable) {
            onStop();
        }
    };

    // 当复合模式启用时，自动设置表单类型为 composite
    useEffect(() => {
        if (isCompositeMode) {
            form.setFieldsValue({
                type: 'composite',
            });
        }
    }, [form, isCompositeMode]);

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
                style={{width: '100%', marginBottom: '0'}}
                className="textarea-container"
            >
                <div className="input-with-button">
                    <Input.TextArea
                        style={{height: textAreaHeight, resize: 'none'}}
                        placeholder={isCompositeMode ? "请描述你想要执行的自动化任务..." : "请描述你的操作、查询或断言..."}
                        ref={textAreaRef}
                        onChange={handleTextAreaChange}
                        onPressEnter={(e) => {
                            if (e.ctrlKey || e.metaKey) {
                                handleSubmit();
                                e.preventDefault();
                            }
                        }}
                    />
                    
                    {/* 嵌入式执行按钮 */}
                    {!hideRunButton && (
                        loading && stoppable ? (
                            <Button
                                className="execute-button"
                                type="primary"
                                danger
                                icon={<StopOutlined/>}
                                onClick={handleStop}
                            />
                        ) : (
                            <ExecuteButton
                                onClick={handleSubmit}
                                loading={loading && !stoppable}
                                disabled={!runButtonEnabled || loading}
                            />
                        )
                    )}
                </div>
            </Form.Item>

            {/* 原始按钮容器（隐藏） */}
            <Space className="prompt-input-button-container">
                {loading && stoppable ? (
                    <Button
                        type="default"
                        icon={<StopOutlined/>}
                        onClick={handleStop}
                        danger
                    >
                        停止
                    </Button>
                ) : null}

                {!hideRunButton && (
                    <Button
                        type="primary"
                        icon={loading ? <LoadingOutlined/> : <SendOutlined/>}
                        onClick={handleSubmit}
                        disabled={!runButtonEnabled || loading}
                        loading={loading && !stoppable}
                    >
                        执行
                    </Button>
                )}
            </Space>
        </div>
    );
} 