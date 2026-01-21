"use client"

import React, { createContext, useContext, useEffect, useState } from "react"

export type ColorPalette = 'default' | 'sunset' | 'forest' | 'ocean'

interface ColorPaletteContextType {
    palette: ColorPalette
    setPalette: (palette: ColorPalette) => void
}

const ColorPaletteContext = createContext<ColorPaletteContextType | undefined>(undefined)

export function ColorPaletteProvider({ children }: { children: React.ReactNode }) {
    const [palette, setPalette] = useState<ColorPalette>('default')
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        const savedPalette = localStorage.getItem('color-palette') as ColorPalette
        if (savedPalette) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPalette(savedPalette)
        }
        setMounted(true)
    }, [])

    useEffect(() => {
        if (!mounted) return
        localStorage.setItem('color-palette', palette)
        document.documentElement.setAttribute('data-palette', palette)
    }, [palette, mounted])


    return (
        <ColorPaletteContext.Provider value={{ palette, setPalette }}>
            {children}
        </ColorPaletteContext.Provider>
    )
}

export const useColorPalette = () => {
    const context = useContext(ColorPaletteContext)
    if (context === undefined) {
        throw new Error("useColorPalette must be used within a ColorPaletteProvider")
    }
    return context
}
