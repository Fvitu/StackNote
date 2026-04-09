type StackNoteLogoProps = {
	className?: string;
	alt?: string;
};

export function StackNoteLogo({ className, alt = "StackNote logo" }: StackNoteLogoProps) {
	return <img src="/StackNote.png" alt={alt} width={64} height={64} className={className} draggable={false} />;
}
