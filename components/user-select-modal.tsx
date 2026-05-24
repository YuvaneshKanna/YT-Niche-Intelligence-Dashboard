"use client"

import { useState, useEffect } from "react"

interface UserSelectModalProps {
    onSelect: (user: string) => void
}

export function UserSelectModal({ onSelect }: UserSelectModalProps) {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        const stored = localStorage.getItem('yt-dashboard-user')
        if (stored) {
            onSelect(stored)
        } else {
            setVisible(true)
        }
    }, [])

    const handleSelect = (user: string) => {
        localStorage.setItem('yt-dashboard-user', user)
        setVisible(false)
        onSelect(user)
    }

    if (!visible) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-8">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-foreground mb-2">YT Niche Overview</h1>
                    <p className="text-muted-foreground text-sm">Who are you?</p>
                </div>
                <div className="flex gap-6">
                    {["RASTRON", "ROGERS"].map((user) => (
                        <button
                            key={user}
                            onClick={() => handleSelect(user)}
                            className="flex flex-col items-center gap-3 w-36 h-36 rounded-2xl border-2 border-border bg-muted/40 hover:border-primary hover:bg-primary/10 transition-all duration-200 justify-center group"
                        >
                            <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-200">
                                {user.charAt(0)}
                            </div>
                            <span className="text-sm font-semibold text-foreground">{user}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}