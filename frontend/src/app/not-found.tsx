import Button from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
      <h1 className="font-display text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
        404
      </h1>
      <p className="text-lg text-fog mb-8 max-w-md">
        This capability does not exist or has been removed from the network.
      </p>
      <Button href="/" variant="primary">
        Back to home
      </Button>
    </div>
  );
}
