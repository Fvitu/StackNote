"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function AlertDialog({ ...props }: DialogPrimitive.Root.Props) {
	return <DialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
	return <DialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

function AlertDialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
	return <DialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

function AlertDialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
	return (
		<DialogPrimitive.Backdrop
			data-slot="alert-dialog-overlay"
			className={cn("fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0", className)}
			{...props}
		/>
	);
}

function AlertDialogContent({ className, ...props }: DialogPrimitive.Popup.Props) {
	return (
		<AlertDialogPortal>
			<AlertDialogOverlay />
			<DialogPrimitive.Popup
				data-slot="alert-dialog-content"
				className={cn(
					"fixed left-1/2 top-1/2 z-[60] flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-[24px] border border-[var(--border-default)] bg-[var(--bg-sidebar)] p-6 text-[var(--text-primary)] shadow-[0_28px_80px_rgba(0,0,0,0.45)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
					className,
				)}
				{...props}
			/>
		</AlertDialogPortal>
	);
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="alert-dialog-header" className={cn("space-y-2", className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="alert-dialog-footer" className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}

function AlertDialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
	return <DialogPrimitive.Title data-slot="alert-dialog-title" className={cn("text-base font-semibold", className)} {...props} />;
}

function AlertDialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
	return <DialogPrimitive.Description data-slot="alert-dialog-description" className={cn("text-sm text-[var(--text-secondary)]", className)} {...props} />;
}

function AlertDialogAction({ className, ...props }: DialogPrimitive.Close.Props) {
	return (
		<DialogPrimitive.Close
			data-slot="alert-dialog-action"
			render={
				<Button
					className={cn(
						"border border-rose-500/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 focus-visible:ring-2 focus-visible:ring-[#7c6aff]",
						className,
					)}
				/>
			}
			{...props}
		/>
	);
}

function AlertDialogCancel({ className, ...props }: DialogPrimitive.Close.Props) {
	return (
		<DialogPrimitive.Close
			data-slot="alert-dialog-cancel"
			render={
				<Button
					variant="ghost"
					className={cn(
						"border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[#1a1a1a] focus-visible:ring-2 focus-visible:ring-[#7c6aff]",
						className,
					)}
				/>
			}
			{...props}
		/>
	);
}

export {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogOverlay,
	AlertDialogPortal,
	AlertDialogTitle,
	AlertDialogTrigger,
};
