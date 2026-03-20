"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface NameCaptureDialogProps {
  open: boolean
  onNameSubmit: (name: string) => Promise<void>
}

export function NameCaptureDialog({ open, onNameSubmit }: NameCaptureDialogProps) {
  const [name, setName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("Please enter your name")
      return
    }

    setIsSubmitting(true)
    setError("")

    try {
      await onNameSubmit(trimmedName)
    } catch (err) {
      setError("Failed to save name. Please try again.")
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Welcome to StackNote!</DialogTitle>
            <DialogDescription>
              Please enter your name to get started.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 mb-4">
            <Input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={isSubmitting}
              className={error ? "border-red-500" : ""}
            />
            {error && (
              <p className="mt-1 text-xs text-red-500">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              style={{
                backgroundColor: "var(--sn-accent)",
                color: "white",
              }}
            >
              {isSubmitting ? "Saving..." : "Continue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
