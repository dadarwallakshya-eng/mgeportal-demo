'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, Move } from 'lucide-react';
import { Button } from './button';

interface ImageCropperProps {
  src: string;
  isOpen: boolean;
  onCrop: (croppedBase64: string) => void;
  onCancel: () => void;
}

export function ImageCropper({ src, isOpen, onCrop, onCancel }: ImageCropperProps) {
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset offset on image change
  useEffect(() => {
    setOffsetX(0);
    setOffsetY(0);
    setZoom(1);
  }, [src]);

  if (!isOpen) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setOffsetX((prev) => prev + dx);
    setOffsetY((prev) => prev + dy);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch support for mobile devices
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const dx = touch.clientX - dragStart.x;
    const dy = touch.clientY - dragStart.y;
    setOffsetX((prev) => prev + dx);
    setOffsetY((prev) => prev + dy);
    setDragStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleExecuteCrop = () => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;

    try {
      const canvas = document.createElement('canvas');
      // Output resolution: 300x300 is ideal for portal profile pictures
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const imgRect = img.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // The crop window is a 200x200 square centered in the container
      const cropSize = 200;
      const cropX = (containerRect.width - cropSize) / 2;
      const cropY = (containerRect.height - cropSize) / 2;

      // Position of the crop window relative to the scaled image's top-left (aligning viewport coordinates)
      const relativeX = (containerRect.left + cropX) - imgRect.left;
      const relativeY = (containerRect.top + cropY) - imgRect.top;

      // Projection ratio from screen dimensions to natural pixel size
      const scaleX = img.naturalWidth / imgRect.width;
      const scaleY = img.naturalHeight / imgRect.height;

      const sourceX = relativeX * scaleX;
      const sourceY = relativeY * scaleY;
      const sourceWidth = cropSize * scaleX;
      const sourceHeight = cropSize * scaleY;

      ctx.clearRect(0, 0, 300, 300);
      ctx.drawImage(
        img,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        300,
        300
      );

      // Generate compressed high-quality JPEG
      const base64 = canvas.toDataURL('image/jpeg', 0.9);
      onCrop(base64);
    } catch (err) {
      console.error('[IMAGE_CROPPER_ERROR] Cropping failed:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-sm rounded-xl border border-beige bg-paper text-ink shadow-2xl p-5 relative flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-beige pb-2">
          <span className="text-xs font-extrabold uppercase tracking-wider text-brand">
            Crop &amp; Edit Photo
          </span>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-cream rounded text-mute hover:text-ink cursor-pointer transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Cropping Canvas/Spotlight Box */}
        <div
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleMouseUp}
          className="relative w-full aspect-square bg-neutral-900 rounded-lg overflow-hidden flex items-center justify-center cursor-move select-none touch-none border border-beige"
        >
          {/* Draggable Source Image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt="Source image to crop"
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            draggable={false}
            className="absolute origin-center transition-transform duration-75 max-w-none"
            style={{
              transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${zoom})`,
              left: '50%',
              top: '50%',
              width: '85%', // Default base size within container
            }}
          />

          {/* Spotlight Mask Overlay: darkens outside, transparent inside square */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Center crop guide boundary box */}
            <div
              className="w-[200px] h-[200px] border border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] relative flex items-center justify-center"
              style={{ boxSizing: 'content-box' }}
            >
              {/* Corner brackets */}
              <div className="absolute -left-1 -top-1 w-3 h-3 border-l-2 border-t-2 border-brand" />
              <div className="absolute -right-1 -top-1 w-3 h-3 border-r-2 border-t-2 border-brand" />
              <div className="absolute -left-1 -bottom-1 w-3 h-3 border-l-2 border-b-2 border-brand" />
              <div className="absolute -right-1 -bottom-1 w-3 h-3 border-r-2 border-b-2 border-brand" />
              <Move className="text-white/40 h-5 w-5 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Zoom Controls Slider */}
        <div className="space-y-1.5 text-3xs font-semibold text-mute">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1"><ZoomOut size={11} /> Zoom Out</span>
            <span className="flex items-center gap-1">Zoom In <ZoomIn size={11} /></span>
          </div>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-full accent-brand h-1.5 bg-beige rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* Action Controls */}
        <div className="flex justify-end gap-2 border-t border-beige pt-3">
          <Button
            variant="outline"
            onClick={onCancel}
            className="text-xs h-8 border-beige text-mute hover:text-ink cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            onClick={handleExecuteCrop}
            className="bg-brand hover:bg-[#4a2090] text-white font-bold text-xs h-8 px-4 rounded-lg cursor-pointer"
          >
            Crop &amp; Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
