import { useState, useEffect } from "react";
import { render, Text, Box, useInput, useApp } from "ink";

function Counter() {
  const [counter, setCounter] = useState(0);
  const { exit } = useApp();

  useEffect(() => {
    const timer = setInterval(() => {
      setCounter((prev) => prev + 1);
    }, 100);
    return () => clearInterval(timer);
  }, []);

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exit();
    }
  });

  return (
    // @ts-ignore
    <Box flexDirection="column" padding={1}>
      <Text color="green" bold>
        {counter} tests passed
      </Text>
      <Text dimColor>Press q or Esc to exit</Text>
    </Box>
  );
}

render(<Counter />);
