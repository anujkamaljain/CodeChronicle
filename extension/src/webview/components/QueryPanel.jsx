import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useStore from '../store/useStore';

const EXAMPLE_QUERIES = [
    'Which files handle authentication?',
    'What are the most critical files in this codebase?',
    'Show me files with database connections',
    'Which files have the most dependencies?',
    'What does the main entry point do?',
    'Find files related to API endpoints',
];

export default function QueryPanel({ onQuery, onOpenFile }) {
    const { queryResult, queryHistory, isLoading, loadingMessage, currentQuery, setCurrentQuery, addQueryToHistory } = useStore();
    const [localQuery, setLocalQuery] = useState('');
    const inputRef = useRef(null);

    const handleSubmit = (e) => {
        e.preventDefault();
        const q = localQuery.trim();
        if (!q) return;
        setCurrentQuery(q);
        onQuery(q);
        addQueryToHistory(q, null);
        setLocalQuery('');
    };

    const handleExampleClick = (example) => {
        setLocalQuery(example);
        inputRef.current?.focus();
    };

    return (
        <div className="h-full flex flex-col gap-4 max-w-3xl mx-auto">
            {/* Header */}
            <div className="text-center">
                <h2 className="text-lg font-bold text-gradient mb-1">Ask About Your Codebase</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Powered by Amazon Bedrock AI • Natural language queries
                </p>
            </div>

            {/* Query input */}
            <form onSubmit={handleSubmit} className="relative">
                <div className="glass-card p-1" style={{ borderColor: 'rgba(0, 240, 255, 0.15)' }}>
                    <div className="flex items-center gap-2">
                        <textarea
                            ref={inputRef}
                            value={localQuery}
                            onChange={(e) => setLocalQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit(e);
                                }
                            }}
                            placeholder="Ask anything about your codebase..."
                            className="input-glass flex-1 resize-none border-none bg-transparent"
                            rows={2}
                            style={{ background: 'transparent' }}
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !localQuery.trim()}
                            className="btn-neon px-4 py-3 self-end flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            {isLoading ? '...' : 'Ask'}
                        </button>
                    </div>
                </div>
            </form>

            {/* Example queries */}
            {!queryResult && queryHistory.length === 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Try these examples:</p>
                    <div className="flex flex-wrap gap-2">
                        {EXAMPLE_QUERIES.map((q, i) => (
                            <button
                                key={i}
                                onClick={() => handleExampleClick(q)}
                                className="text-xs px-3 py-1.5 rounded-full transition-all hover:scale-105"
                                style={{
                                    background: 'rgba(0, 240, 255, 0.06)',
                                    border: '1px solid rgba(0, 240, 255, 0.15)',
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                {q}
                            </button>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* Loading state */}
            <AnimatePresence>
                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="glass-card p-4"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                                style={{ borderColor: 'var(--neon-cyan)', borderTopColor: 'transparent' }} />
                            <div>
                                <p className="text-sm font-medium" style={{ color: 'var(--neon-cyan)' }}>
                                    {loadingMessage || 'Analyzing your codebase...'}
                                </p>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    This may take a moment for large codebases
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Query result */}
            <AnimatePresence>
                {queryResult && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="glass-card p-4"
                    >
                        {/* Confidence badge */}
                        {queryResult.confidence !== undefined && (
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-xs px-2 py-0.5 rounded-full"
                                    style={{
                                        background: queryResult.confidence > 0.7
                                            ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                                        color: queryResult.confidence > 0.7
                                            ? 'var(--risk-low)' : 'var(--risk-medium)',
                                        border: `1px solid ${queryResult.confidence > 0.7 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                                    }}>
                                    {(queryResult.confidence * 100).toFixed(0)}% confidence
                                </span>
                            </div>
                        )}

                        {/* Answer */}
                        <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--text-primary)' }}>
                            {queryResult.answer}
                        </p>

                        {/* File references */}
                        {queryResult.references && queryResult.references.length > 0 && (
                            <div className="mb-4">
                                <h5 className="text-xs font-semibold mb-2 uppercase tracking-widest"
                                    style={{ color: 'var(--text-muted)' }}>
                                    Referenced Files
                                </h5>
                                <div className="space-y-1.5">
                                    {queryResult.references.map((ref, i) => (
                                        <div key={i}
                                            className="glass-card-sm p-2 flex items-center gap-2 cursor-pointer hover:border-opacity-50 transition-all"
                                            onClick={() => onOpenFile(ref.path)}
                                        >
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--neon-cyan)' }} />
                                            <span className="text-xs font-mono flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
                                                {ref.path}
                                            </span>
                                            {ref.lineNumbers && (
                                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                                    L{ref.lineNumbers.join(', L')}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Suggested follow-ups */}
                        {queryResult.suggestedQuestions && queryResult.suggestedQuestions.length > 0 && (
                            <div>
                                <h5 className="text-xs font-semibold mb-2 uppercase tracking-widest"
                                    style={{ color: 'var(--text-muted)' }}>
                                    Follow-up Questions
                                </h5>
                                <div className="flex flex-wrap gap-1.5">
                                    {queryResult.suggestedQuestions.map((q, i) => (
                                        <button
                                            key={i}
                                            onClick={() => handleExampleClick(q)}
                                            className="text-xs px-2.5 py-1 rounded-full transition-all"
                                            style={{
                                                background: 'rgba(168, 85, 247, 0.08)',
                                                border: '1px solid rgba(168, 85, 247, 0.2)',
                                                color: 'var(--neon-purple)',
                                            }}
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Query history */}
            {queryHistory.length > 0 && !isLoading && (
                <div>
                    <h4 className="text-xs font-semibold mb-2 uppercase tracking-widest"
                        style={{ color: 'var(--text-muted)' }}>
                        Recent Queries
                    </h4>
                    <div className="space-y-1.5">
                        {queryHistory.slice(0, 10).map((item, i) => (
                            <div key={i}
                                className="glass-card-sm p-2 cursor-pointer hover:border-opacity-50 transition-all"
                                onClick={() => handleExampleClick(item.query)}
                            >
                                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                    {item.query}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
