"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SFX_CATEGORIES,
  getSfxSettings,
  setSfxSettings,
  sfxPreview,
  type SfxSettings,
  type SfxCategoryKey,
} from "@/lib/sfx";
import { Tip } from "@/components/ui/tip";
import { cn } from "@/lib/utils";

export function SfxSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [settings, setSettings] = useState<SfxSettings>(getSfxSettings);

  // Sync from module on open
  useEffect(() => {
    if (open) setSettings(getSfxSettings());
  }, [open]);

  const update = useCallback((next: SfxSettings) => {
    setSettings(next);
    setSfxSettings(next);
  }, []);

  const setMaster = useCallback((v: number) => {
    update({ ...settings, master: v });
  }, [settings, update]);

  const toggleMute = useCallback(() => {
    update({ ...settings, muted: !settings.muted });
  }, [settings, update]);

  const setCatVolume = useCallback((key: SfxCategoryKey, v: number) => {
    update({
      ...settings,
      categories: {
        ...settings.categories,
        [key]: { ...settings.categories[key], volume: v },
      },
    });
  }, [settings, update]);

  const toggleCat = useCallback((key: SfxCategoryKey) => {
    update({
      ...settings,
      categories: {
        ...settings.categories,
        [key]: { ...settings.categories[key], enabled: !settings.categories[key].enabled },
      },
    });
  }, [settings, update]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-background shadow-lg flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Volume2 className="size-4" />
            Sound Effects
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 transition-colors hover:bg-muted/50"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-4">
          {/* Master volume */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-20 shrink-0">Master</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.master * 100)}
              onChange={(e) => setMaster(Number(e.target.value) / 100)}
              className="flex-1 h-1.5 accent-primary cursor-pointer"
            />
            <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">
              {Math.round(settings.master * 100)}
            </span>
            <Button
              variant={settings.muted ? "destructive" : "ghost"}
              size="icon-xs"
              onClick={toggleMute}
              title={settings.muted ? "Unmute all" : "Mute all"}
            >
              {settings.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
            </Button>
          </div>

          {/* Divider */}
          <div className="border-t" />

          {/* Category rows */}
          <div className="space-y-2.5">
            {SFX_CATEGORIES.map((cat) => {
              const catSettings = settings.categories[cat.key];
              const disabled = settings.muted || !catSettings.enabled;
              return (
                <div key={cat.key} className={cn("space-y-1", disabled && "opacity-40")}>
                  {/* Row 1: label + controls */}
                  <div className="flex items-center gap-2">
                    {/* Color dot */}
                    <span className={cn("size-2 rounded-full shrink-0", cat.color)} />
                    {/* Label */}
                    <Tip text={cat.label}><span className="text-xs font-medium flex-1 truncate">{cat.label}</span></Tip>
                    {/* Preview */}
                    <button
                      onClick={() => sfxPreview(cat.key)}
                      className="rounded p-1 transition-colors hover:bg-muted/50"
                      title="Preview sound"
                    >
                      <Play className="size-3" />
                    </button>
                    {/* Toggle */}
                    <button
                      onClick={() => toggleCat(cat.key)}
                      className={cn(
                        "size-4 rounded border transition-colors flex items-center justify-center",
                        catSettings.enabled
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/30"
                      )}
                      title={catSettings.enabled ? "Disable" : "Enable"}
                    >
                      {catSettings.enabled && (
                        <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {/* Row 2: description + volume */}
                  <div className="flex items-center gap-2 pl-4">
                    <Tip text={cat.description}><span className="text-[10px] text-muted-foreground flex-1 truncate">
                      {cat.description}
                    </span></Tip>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(catSettings.volume * 100)}
                      onChange={(e) => setCatVolume(cat.key, Number(e.target.value) / 100)}
                      className="w-20 h-1 accent-primary cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground w-6 text-right tabular-nums">
                      {Math.round(catSettings.volume * 100)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2.5 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            Sounds by Kenney (CC0) via soundcn
          </span>
          <Button variant="ghost" size="xs" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
