"use client";

import React, { useState, useRef } from "react";

interface FileUploadProps {
  onUpload: (file: File) => Promise<void>;
  accept?: string;
  isUploading?: boolean;
  uploadedFileName?: string | null;
  onRemove?: () => void;
  label?: string;
}

export function FileUpload({ 
  onUpload, 
  accept = ".pdf,.docx,.txt,.md,application/pdf,text/plain,text/markdown",
  isUploading = false,
  uploadedFileName,
  onRemove,
  label = "Upload CV / Resume"
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isClicked, setIsClicked] = useState(false);
  
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onUpload(file);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await onUpload(file);
    }
  };

  if (uploadedFileName) {
    return (
      <div className="relative group overflow-hidden rounded-xl border border-white/20 bg-white/5 p-6 backdrop-blur-md transition-all hover:bg-white/10 hover:border-brand-cyan/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-brand-cyan/20 flex items-center justify-center text-brand-cyan">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </div>
            <div>
              <p className="text-white font-medium truncate max-w-[200px] sm:max-w-xs">{uploadedFileName}</p>
              <p className="text-xs text-brand-cyan mt-1">Ready for analysis</p>
            </div>
          </div>
          {onRemove && (
            <button 
              type="button"
              onClick={onRemove}
              className="text-xs font-mono px-3 py-1.5 rounded bg-white/10 hover:bg-coral/20 hover:text-coral transition-colors text-muted"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`group relative rounded-xl border-2 border-dashed transition-all duration-500 ease-out flex flex-col items-center justify-center p-8 text-center cursor-pointer overflow-hidden ${
        isDragging 
          ? "border-brand-cyan bg-brand-cyan/10 scale-[1.02] shadow-[0_0_40px_rgba(80,223,251,0.4)]" 
          : isClicked 
            ? "border-brand-cyan bg-brand-cyan/20 shadow-[0_0_50px_rgba(80,223,251,0.6)] scale-[0.98]"
            : "border-white/20 bg-white/5 hover:border-brand-cyan/50 hover:bg-brand-cyan/5 hover:shadow-[0_0_20px_rgba(80,223,251,0.15)]"
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onMouseMove={handleMouseMove}
      onClick={() => {
        setIsClicked(true);
        setTimeout(() => setIsClicked(false), 800);
        fileInputRef.current?.click();
      }}
    >
      <div 
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(400px circle at ${mousePos.x}px ${mousePos.y}px, rgba(80,223,251,0.2), transparent 40%)`
        }}
      />
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept={accept} 
        className="hidden" 
        disabled={isUploading}
      />
      
      {isUploading ? (
        <div className="flex flex-col items-center justify-center animate-pulse">
          <div className="w-12 h-12 rounded-full border-2 border-t-brand-cyan border-white/10 animate-spin mb-4"></div>
          <p className="text-sm text-brand-cyan font-medium">Uploading securely...</p>
        </div>
      ) : (
        <>
          <div className={`w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4 text-muted transition-transform duration-300 ${isDragging ? 'scale-110 text-brand-cyan' : 'group-hover:scale-110'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          </div>
          <p className="text-white font-medium mb-1">{label}</p>
          <p className="text-xs text-muted mb-4 max-w-[250px] mx-auto">
            Drag & drop your file here, or click to browse. Supports PDF, DOCX, TXT.
          </p>
        </>
      )}

      {/* Decorative glow in the background */}
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-brand-cyan/40 via-transparent to-transparent"></div>
    </div>
  );
}
