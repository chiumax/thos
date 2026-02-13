import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AsciiBackground } from "@/components/ascii-background";
import { ScrambleText } from "@/components/ui/scramble-text";

const ASCII_LOGO = `
 ┌┬┐┬ ┬┌─┐┌─┐
  │ ├─┤│ │└─┐
  ┴ ┴ ┴└─┘└─┘
`;

const features = [
  {
    title: "agent dashboard",
    description: "see what every agent is doing, in real time, at a glance",
    icon: ">>",
  },
  {
    title: "persistent memory",
    description: "context that evolves with your codebase and workflows",
    icon: "[]",
  },
  {
    title: "change management",
    description: "track, diff, and roll back agent-generated changes",
    icon: "<>",
  },
  {
    title: "task orchestration",
    description: "assign, sequence, and track work across agents",
    icon: "##",
  },
];

export default function Home() {
  return (
    <>
      <AsciiBackground />
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-12 p-8">
        <div className="animate-in fade-in duration-700 fill-mode-both flex flex-col items-center gap-4 text-center">
          <pre className="glow-pulse text-primary text-lg leading-tight sm:text-2xl">
            {ASCII_LOGO}
          </pre>
          <p className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150 fill-mode-both text-muted-foreground max-w-md text-sm">
            <ScrambleText
              text="the orchestrator you never knew you needed."
              delay={200}
              duration={800}
            />
            <br />
            <ScrambleText
              text="a visual orchestration layer for "
              delay={400}
              duration={700}
              className="text-muted-foreground"
            />
            <ScrambleText
              text="claude code"
              delay={500}
              duration={700}
              className="text-primary"
            />
            <ScrambleText text="." delay={600} duration={400} />
          </p>
        </div>

        <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          {features.map((feature, i) => (
            <Card
              key={feature.title}
              className="animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both border-dashed bg-card/60 backdrop-blur-sm"
              style={{ animationDelay: `${300 + i * 100}ms` }}
            >
              <CardHeader>
                <CardDescription className="text-primary font-bold">
                  <ScrambleText
                    text={feature.icon}
                    delay={400 + i * 100}
                    duration={400}
                  />
                </CardDescription>
                <CardTitle className="text-sm">
                  <ScrambleText
                    text={feature.title}
                    delay={500 + i * 100}
                    duration={600}
                  />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-xs">
                  <ScrambleText
                    text={feature.description}
                    delay={600 + i * 100}
                    duration={700}
                  />
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-700 fill-mode-both flex items-center gap-3">
          <Button>
            <ScrambleText text="get started" delay={800} duration={500} />
          </Button>
          <Button variant="outline" className="backdrop-blur-sm">
            <ScrambleText text="view source" delay={900} duration={500} />
          </Button>
        </div>

        <p className="animate-in fade-in duration-500 delay-1000 fill-mode-both text-muted-foreground text-xs">
          <ScrambleText
            text="early stage — solving my own problems first"
            delay={1100}
            duration={600}
          />
        </p>
      </div>
    </>
  );
}
