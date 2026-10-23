// Package reportbug runs the in-app "Report bug" Cursor agent. The Cursor SDK is TypeScript-only, so the
// Go API delegates the run to agent/report-bug.ts via Bun and exchanges JSON over stdin/stdout.
package reportbug

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/jetsemrick/fullstack/apps/api/internal/contract"
)

// Error carries the API error code the route should map to (CONFIG -> 503, UPSTREAM -> 502, else 500).
type Error struct {
	Code    contract.ErrorCode
	Message string
}

func (e *Error) Error() string { return e.Message }

type Runner func(ctx context.Context, message string) (contract.ReportBugResponse, error)

// bridgeOutput is the single JSON line agent/report-bug.ts writes to stdout.
type bridgeOutput struct {
	contract.ReportBugResponse
	ErrorCode    contract.ErrorCode `json:"errorCode,omitempty"`
	ErrorMessage string             `json:"errorMessage,omitempty"`
}

// NewBunRunner returns a Runner that executes scriptPath with Bun from repoRoot.
func NewBunRunner(scriptPath, repoRoot string) Runner {
	return func(ctx context.Context, message string) (contract.ReportBugResponse, error) {
		if strings.TrimSpace(os.Getenv("CURSOR_API_KEY")) == "" {
			return contract.ReportBugResponse{}, &Error{Code: contract.CodeConfig, Message: "CURSOR_API_KEY is not configured"}
		}
		bun, err := exec.LookPath("bun")
		if err != nil {
			return contract.ReportBugResponse{}, &Error{Code: contract.CodeInternal, Message: "bun is required to run the Cursor SDK agent"}
		}
		input, err := json.Marshal(map[string]string{"message": message})
		if err != nil {
			return contract.ReportBugResponse{}, err
		}
		cmd := exec.CommandContext(ctx, bun, "run", scriptPath)
		cmd.Dir = repoRoot
		cmd.Stdin = bytes.NewReader(input)
		var stdout bytes.Buffer
		cmd.Stdout = &stdout
		cmd.Stderr = os.Stderr
		runErr := cmd.Run()

		var out bridgeOutput
		if err := json.Unmarshal(lastLine(stdout.Bytes()), &out); err != nil {
			if runErr != nil {
				return contract.ReportBugResponse{}, &Error{Code: contract.CodeInternal, Message: fmt.Sprintf("agent bridge failed: %v", runErr)}
			}
			return contract.ReportBugResponse{}, &Error{Code: contract.CodeInternal, Message: "agent bridge returned invalid output"}
		}
		if out.ErrorCode != "" {
			return contract.ReportBugResponse{}, &Error{Code: out.ErrorCode, Message: out.ErrorMessage}
		}
		if out.RunID == "" || out.Status == "" {
			return contract.ReportBugResponse{}, &Error{Code: contract.CodeInternal, Message: "agent bridge returned an incomplete result"}
		}
		return out.ReportBugResponse, nil
	}
}

func lastLine(b []byte) []byte {
	lines := bytes.Split(bytes.TrimSpace(b), []byte("\n"))
	return lines[len(lines)-1]
}

// CodeOf extracts the route error code from err, defaulting to INTERNAL.
func CodeOf(err error) contract.ErrorCode {
	var e *Error
	if errors.As(err, &e) {
		switch e.Code {
		case contract.CodeConfig, contract.CodeUpstream:
			return e.Code
		}
	}
	return contract.CodeInternal
}
