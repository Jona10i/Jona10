import React, { useState, useEffect } from 'react';
import { Search, Type, Minus, Plus, AlignLeft, AlignCenter, AlignRight, FileText, Check, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useFirebase } from './FirebaseProvider';

const FONT_CATEGORIES = ['All', 'Sans Serif', 'Serif', 'Monospace', 'Display'];

const FONTS = [
  { name: 'Inter', category: 'Sans Serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], axes: [{ tag: 'slnt', name: 'Slant', min: -10, max: 0, default: 0, step: 1 }] },
  { name: 'Roboto Flex', category: 'Sans Serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000], axes: [
      { tag: 'wdth', name: 'Width', min: 25, max: 151, default: 100, step: 1 },
      { tag: 'slnt', name: 'Slant', min: -10, max: 0, default: 0, step: 1 },
      { tag: 'opsz', name: 'Optical Size', min: 8, max: 144, default: 14, step: 1 }
  ]},
  { name: 'Poppins', category: 'Sans Serif', weights: [300, 400, 500, 600, 700] },
  { name: 'Montserrat', category: 'Sans Serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { name: 'Open Sans', category: 'Sans Serif', weights: [300, 400, 500, 600, 700], axes: [{ tag: 'wdth', name: 'Width', min: 75, max: 100, default: 100, step: 1 }] },
  { name: 'Outfit', category: 'Sans Serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  
  { name: 'Playfair Display', category: 'Serif', weights: [400, 500, 600, 700] },
  { name: 'Merriweather', category: 'Serif', weights: [300, 400, 700] },
  { name: 'Lora', category: 'Serif', weights: [400, 500, 600, 700] },
  { name: 'PT Serif', category: 'Serif', weights: [400, 700] },

  { name: 'JetBrains Mono', category: 'Monospace', weights: [100, 200, 300, 400, 500, 600, 700, 800] },
  { name: 'Fira Code', category: 'Monospace', weights: [300, 400, 500, 600, 700] },
  { name: 'Roboto Mono', category: 'Monospace', weights: [100, 200, 300, 400, 500, 600, 700] },
  { name: 'Space Mono', category: 'Monospace', weights: [400, 700] },

  { name: 'Space Grotesk', category: 'Display', weights: [300, 400, 500, 600, 700] },
  { name: 'Oswald', category: 'Display', weights: [200, 300, 400, 500, 600, 700] },
  { name: 'Bebas Neue', category: 'Display', weights: [400] },
  { name: 'Cinzel', category: 'Display', weights: [400, 500, 600, 700] }
];

export const FontCatalogView = () => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [fontSize, setFontSize] = useState(32);
  const [fontWeight, setFontWeight] = useState(400);
  const [alignment, setAlignment] = useState<'left' | 'center' | 'right'>('left');
  const [previewText, setPreviewText] = useState('The quick brown fox jumps over the lazy dog');
  const [copiedFont, setCopiedFont] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const handleReset = () => {
    setFontSize(32);
    setFontWeight(400);
    setAlignment('left');
    setResetKey(prev => prev + 1);
  };

  // Load fonts dynamically
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    const families = FONTS.map((f: any) => {
      if (f.axes && f.axes.length > 0) {
        const allTags = ['wght', ...f.axes.map((a: any) => a.tag)].sort();
        const tagRanges = allTags.map(tag => {
          if (tag === 'wght') return `${f.weights[0]}..${f.weights[f.weights.length-1]}`;
          const axis = f.axes.find((a: any) => a.tag === tag);
          return `${axis.min}..${axis.max}`;
        });
        return `${f.name.replace(/ /g, '+')}:${allTags.join(',')}@${tagRanges.join(',')}`;
      } else {
        return `${f.name.replace(/ /g, '+')}:wght@${f.weights.join(';')}`;
      }
    });
    link.href = `https://fonts.googleapis.com/css2?family=${families.join('&family=')}&display=swap`;
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  const filteredFonts = FONTS.filter(font => {
    const matchesSearch = font.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'All' || font.category === category;
    return matchesSearch && matchesCategory;
  });

const FontCard = ({ 
  font, 
  fontSize, 
  fontWeight, 
  alignment, 
  previewText, 
  copiedFont, 
  setCopiedFont 
}: { 
  font: any, 
  fontSize: number, 
  fontWeight: number, 
  alignment: any, 
  previewText: string, 
  copiedFont: string | null, 
  setCopiedFont: (name: string | null) => void 
}) => {
  const { user, profile } = useFirebase();
  const [isApplying, setIsApplying] = useState(false);
  const [axisValues, setAxisValues] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    if (font.axes) {
      font.axes.forEach((a: any) => {
        initial[a.tag] = a.default;
      });
    }
    return initial;
  });

  const handleAxisChange = (tag: string, value: number) => {
    setAxisValues(prev => ({ ...prev, [tag]: value }));
  };

  const actualWeight = font.weights.includes(fontWeight) 
    ? fontWeight 
    : font.weights.reduce((prev: number, curr: number) => 
        Math.abs(curr - fontWeight) < Math.abs(prev - fontWeight) ? curr : prev
      );

  const fontVariationSettings = font.axes && Object.keys(axisValues).length > 0
    ? Object.entries(axisValues).map(([tag, val]) => `"${tag}" ${val}`).join(', ')
    : 'normal';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden flex flex-col"
    >
      <div className="flex items-center justify-between mb-6 border-b border-slate-50 pb-4 shrink-0">
        <div className="flex items-center gap-2">
          <h3 
            className="font-bold text-slate-900 cursor-pointer hover:text-workspace-accent transition-colors flex items-center gap-2"
            title="Click to copy font name"
            onClick={() => {
              try {
                navigator.clipboard.writeText(font.name).catch(() => {});
                setCopiedFont(font.name);
                setTimeout(() => setCopiedFont(null), 2000);
              } catch(e) {}
            }}
          >
            {font.name}
            {copiedFont === font.name && (
              <span className="text-[10px] text-emerald-500 font-black uppercase tracking-widest bg-emerald-50 px-1.5 py-0.5 rounded">Copied</span>
            )}
          </h3>
          <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mt-1">{font.category}</p>
        </div>
        <div className="text-[10px] font-mono bg-slate-50 px-2 py-1 rounded text-slate-500 font-bold whitespace-nowrap">
          {font.axes ? 'Variable' : `${font.weights.length} weights`}
        </div>
      </div>
      
      <div className="flex-1 min-h-[120px] flex items-center justify-center relative z-10 w-full overflow-hidden mb-4">
        <p 
          style={{ 
            fontFamily: `"${font.name}", sans-serif`,
            fontSize: `${fontSize}px`,
            fontWeight: font.axes ? fontWeight : actualWeight, // Use global weight directly for variable fonts
            textAlign: alignment,
            lineHeight: 1.2,
            fontVariationSettings: fontVariationSettings !== 'normal' ? fontVariationSettings : undefined,
            transition: 'font-weight 0.3s ease-out, font-variation-settings 0.3s ease-out, font-size 0.3s ease-out, font-family 0.3s ease-out'
          }}
          className="text-slate-900 w-full break-words outline-none"
          contentEditable
          suppressContentEditableWarning
        >
          {previewText || font.name}
        </p>
      </div>

      {font.axes && (
        <div className="mt-auto space-y-3 pt-4 border-t border-slate-50">
          {font.axes.map((axis: any) => (
            <div key={axis.tag} className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest w-16">{axis.name}</span>
              <input 
                type="range"
                min={axis.min}
                max={axis.max}
                step={axis.step || 1}
                value={axisValues[axis.tag]}
                onChange={(e) => handleAxisChange(axis.tag, Number(e.target.value))}
                className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-workspace-accent"
              />
              <span className="text-xs font-mono text-slate-500 w-8">{axisValues[axis.tag]}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-slate-50 flex flex-wrap gap-2 justify-end">
        <button 
          className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:bg-slate-200 active:scale-95"
          onClick={(e) => {
              e.stopPropagation();
              try {
                const css = `font-family: "${font.name}", sans-serif; \nfont-weight: ${font.axes ? fontWeight : actualWeight};${fontVariationSettings !== 'normal' ? ` \nfont-variation-settings: ${fontVariationSettings};` : ''}`;
                navigator.clipboard.writeText(css).catch(() => {});
              } catch(error) {}
          }}>
          Copy CSS
        </button>
        <button 
          className="bg-workspace-accent text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:brightness-110 active:scale-95 flex items-center gap-1"
          disabled={isApplying}
          onClick={async (e) => {
              e.stopPropagation();
              if (!user || isApplying) return;
              setIsApplying(true);
              try {
                // If they chose specific settings, we could save them, 
                // but just saving the family is typically sufficient for generic text views.
                await updateDoc(doc(db, 'users', user.uid), {
                  appFontFamily: font.name
                });
              } catch(err) {
                console.error(err);
              } finally {
                setIsApplying(false);
              }
          }}>
          {profile?.appFontFamily === font.name ? (
             <><Check className="w-3.5 h-3.5" /> Applied</>
          ) : isApplying ? (
            'Applying...'
          ) : (
            'Use as App Font'
          )}
        </button>
      </div>
    </motion.div>
  );
};

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden relative">
      {/* Header */}
      <div className="p-6 bg-white border-b border-slate-200 shrink-0 z-10 relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 mb-1">Font Catalog</h1>
            <p className="text-sm font-medium text-slate-500">Browse and test typography for your workspace</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-slate-100 rounded-xl p-1 shrink-0">
              {['left', 'center', 'right'].map((align) => (
                <button
                  key={align}
                  onClick={() => setAlignment(align as any)}
                  className={cn(
                    "p-2 rounded-lg transition-all",
                    alignment === align ? "bg-white shadow-sm text-workspace-accent" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {align === 'left' ? <AlignLeft className="w-4 h-4" /> : 
                   align === 'center' ? <AlignCenter className="w-4 h-4" /> : 
                   <AlignRight className="w-4 h-4" />}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 bg-slate-100 px-3 py-1.5 rounded-xl shrink-0">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest w-12">Size</span>
              <button 
                onClick={() => setFontSize(Math.max(12, fontSize - 2))}
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-200 text-slate-600 transition-colors"
                title="Decrease font size"
              >
                <Minus className="w-3 h-3" />
              </button>
              <div className="w-8 text-center text-sm font-bold text-slate-700">{fontSize}</div>
              <button 
                onClick={() => setFontSize(Math.min(120, fontSize + 2))}
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-200 text-slate-600 transition-colors"
                title="Increase font size"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
            
            <div className="flex items-center gap-3 bg-slate-100 px-3 py-1.5 rounded-xl shrink-0">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest w-16">Weight</span>
              <select 
                value={fontWeight} 
                onChange={(e) => setFontWeight(Number(e.target.value))}
                className="bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 p-0 cursor-pointer"
              >
                {[300, 400, 500, 600, 700].map(weight => (
                  <option key={weight} value={weight}>{weight}</option>
                ))}
              </select>
            </div>

            <button 
              onClick={handleReset}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95 shrink-0"
              title="Reset all settings to default"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search fonts..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm focus:ring-2 focus:ring-workspace-accent/50 focus:border-workspace-accent transition-all"
            />
          </div>
          <div className="relative w-full xl:w-[400px]">
            <Type className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="Type something to preview..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm focus:ring-2 focus:ring-workspace-accent/50 focus:border-workspace-accent transition-all"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-4 overflow-x-auto pb-2 scrollbar-none">
          {FONT_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all",
                category === cat 
                  ? "bg-slate-900 text-white shadow-md shadow-slate-900/20" 
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Font Grid */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 mx-auto max-w-[1600px]">
          {filteredFonts.length === 0 ? (
            <div className="col-span-full py-20 text-center text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="font-medium">No fonts found matching your search</p>
            </div>
          ) : (
            filteredFonts.map((font, idx) => (
              <FontCard
                key={`${font.name}-${resetKey}`}
                font={font}
                fontSize={fontSize}
                fontWeight={fontWeight}
                alignment={alignment}
                previewText={previewText}
                copiedFont={copiedFont}
                setCopiedFont={setCopiedFont}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};
