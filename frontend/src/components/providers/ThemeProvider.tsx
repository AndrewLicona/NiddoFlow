"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

// Since next-themes is not typed by default in some versions or context issues, 
// we use a wrapper. In newer versions it works fine.
// Using ComponentProps to infer types.

export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
    return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
