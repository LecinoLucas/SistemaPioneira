export default function AppLoading({ message = "Carregando..." }: { message?: string }) {
  return (
    <div className="min-h-screen grid place-items-center text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span>{message}</span>
      </div>
    </div>
  );
}
