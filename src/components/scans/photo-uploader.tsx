'use client';

import { useState, useRef } from 'react';
import { GlassButton } from '@/components/ui/glass-button';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';

interface PhotoUploaderProps {
    type: string;
    onUpload: (file: File) => void;
}

export function PhotoUploader({ type, onUpload }: PhotoUploaderProps) {
    const [preview, setPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dragActive, setDragActive] = useState(false);

    const handleFile = (file: File) => {
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setPreview(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleSubmit = () => {
        if (fileInputRef.current?.files?.[0]) {
            onUpload(fileInputRef.current.files[0]);
        } else if (preview && fileInputRef.current) {
            // Handle drag and drop case where file input matches
            // Actually, if we draged dropped, we need to store the file object in state
            // But for simplicity let's stick to input or keep file in state
        }
    };

    // We need to store the actual file for upload
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const handleFileSelection = (file: File) => {
        if (file && file.type.startsWith('image/')) {
            setSelectedFile(file);
            const reader = new FileReader();
            reader.onload = (e) => setPreview(e.target?.result as string);
            reader.readAsDataURL(file);
        }
    }

    // Override previous handlers to use new state
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files[0]) handleFileSelection(e.dataTransfer.files[0]);
    }

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) handleFileSelection(e.target.files[0]);
    }

    return (
        <div className="w-full">
            {!preview ? (
                <div
                    className={`relative border-2 border-dashed rounded-xl p-8 transition-colors flex flex-col items-center justify-center min-h-[300px] cursor-pointer
                        ${dragActive ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--glass-border)] hover:border-[var(--color-primary)]/50'}`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={onInputChange}
                        className="hidden"
                    />
                    <div className="w-16 h-16 rounded-full bg-[var(--glass-bg)] flex items-center justify-center mb-4">
                        <Upload className="w-8 h-8 text-[var(--color-primary)]" />
                    </div>
                    <p className="text-lg font-bold mb-2">Upload {type} Photo</p>
                    <p className="text-sm text-[var(--color-text-muted)] text-center max-w-xs">
                        Drag and drop or click to select.
                        {type === 'physique' && ' Full body shots work best.'}
                        {type === 'equipment' && ' Capture all available weights.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="relative rounded-xl overflow-hidden aspect-video bg-black/50 border border-[var(--glass-border)]">
                        <Image
                            src={preview}
                            alt="Scan Preview"
                            fill
                            className="object-contain" // Use contain to see whole image
                        />
                        <button
                            onClick={() => {
                                setPreview(null);
                                setSelectedFile(null);
                            }}
                            className="absolute top-2 right-2 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex gap-3">
                        <GlassButton
                            variant="ghost"
                            onClick={() => {
                                setPreview(null);
                                setSelectedFile(null);
                            }}
                            className="flex-1"
                        >
                            Retake
                        </GlassButton>
                        <GlassButton
                            variant="primary"
                            onClick={() => selectedFile && onUpload(selectedFile)}
                            className="flex-1"
                        >
                            Analyze Now
                        </GlassButton>
                    </div>
                </div>
            )}
        </div>
    );
}
